import path from 'path';
import twilio from 'twilio';
import bodyParser from 'body-parser';

import dotenv from 'dotenv';
dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

const client = twilio(accountSid, authToken);

const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

let userState = {};

app.post('/whatsapp', async (req, res) => {
    const incomingMessage = req.body.Body;
    const from = req.body.From;

    if (!userState[from]) {
        userState[from] = { stage: 'initial' };
    }

    let responseMessage = '';

    switch (userState[from].stage) {
        case 'initial':
            if (incomingMessage === 'hi') {
                responseMessage = 'Greetings Dear Voter, Welcome to Voter सहायक, A WhatsApp Chatbot launched by District Election Officer, South West for making voter experience absolutely hassle-free. To find your polling station, please enter your EPIC Number';
                userState[from].stage = 'awaitingEpic';
           }
             else {
                responseMessage = 'Please send "Hi" to start the conversation.';
           }
            break;

        case 'awaitingEpic':
            console.log('awaitingEpic');
            userState[from].epicNumber = incomingMessage;
            console.log(userState[from].epicNumber);
            userState[from].stage = 'processing';
            responseMessage = 'Processing your request, please wait...';

            // Make request to your backend
            try {
                const backendResponse = await axios.post('https://voterbot.in/data', {
                    epicNumber: userState[from].epicNumber
                });
                responseMessage = `You will vote here: ${backendResponse.data.googleMapsLink}`;
            } catch (error) {
                responseMessage = 'There was an error processing your request. Please try again.';
            }
            userState[from].stage = 'initial';
            break;

        default:
            responseMessage = 'Something went wrong. Please send "Hi" to start the conversation.';
            userState[from].stage = 'initial';
            break;
    }

    client.messages.create({
        from: 'whatsapp:+14155238886',  // Your Twilio Sandbox number
        to: 'whatsapp:+919350449776',
        body: responseMessage
    });
});


app.post('/data', async (req, res) => {
    try {
        console.log(req.body);
        const epicNumber =  req.body.epicNumber;

        const captchaResponse = await axios({
            method: 'get',
            url: 'https://gateway-voters.eci.gov.in/api/v1/captcha-service/generateCaptcha',
            captchaResponseType: 'json'
        });

        const { captcha } = captchaResponse.data;
        const captchaId = captchaResponse.data.id;

        const userAgent = 'ElectionChatbot/1.0 (Node.js/14.x)';
        let cookieJar = 'cookiesession1=678B2873F1DD2DD8137696AA02376010';

        if (captchaResponse.headers['set-cookie']) {
            cookieJar = `${cookieJar}; ${captchaResponse.headers['set-cookie'][0].split(';')[0]}`;
        }

        const base64Data = captcha.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        const imagePath = path.join(process.cwd(), 'captcha.png');
        await writeFile(imagePath, buffer);

        const captchaSolution = await solveCaptcha(imagePath);

        const response2 = await axios({
            method: 'post',
            url: 'https://gateway.eci.gov.in/api/v1/elastic/search-by-epic-from-national-display',
            data: {
                captchaData: captchaSolution,
                captchaId: captchaId,
                epicNumber: epicNumber,
                isPortal: true,
                securityKey: "na",
                stateCd: "U05"
            },
            headers: {
                'Cookie': cookieJar,
                'Content-Type': 'application/json',
                'User-Agent': userAgent,
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive'
            },
            responseType: 'json'
        });

        console.log(response2.data);

        const pollingLocation = extractPollingLocation(response2.data);
        const googleMapsLink = generateGoogleMapsLink(pollingLocation);

        res.json({ pollingLocation, googleMapsLink });
        console.log("Success");
    } catch (error) {
        console.error('Error fetching or solving captcha:', error);
        if (error.response) {
            console.error('Error response:', error.response.data);
        }
        res.status(500).send('Error fetching or solving captcha');
    }
});

async function solveCaptcha(imagePath) {
    return new Promise((resolve, reject) => {
        const pythonProcess = spawn('python', ['captcha_solver.py', imagePath]);

        let solution = '';

        pythonProcess.stdout.on('data', (data) => {
            solution += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            console.error(`Python script error: ${data}`);
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Python script exited with code ${code}`));
            } else {
                resolve(solution.trim());
            }
        });
    });
}

function extractPollingLocation(data) {
    const result = data[0];
    const pollingStation = result.content.psbuildingName;
    const pollingAddress = result.content.buildingAddress;
    const pollingAssembly = result.content.asmblyName;
    const pollingParliament = result.content.prlmntName;
    return `${pollingStation}, ${pollingAddress}, ${pollingParliament}, ${pollingAssembly}`;

}

function generateGoogleMapsLink(location) {
    const encodedLocation = encodeURIComponent(location);
    return `https://www.google.com/maps/dir/?api=1&destination=${encodedLocation}`;
}

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});








