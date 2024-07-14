import express, { response } from 'express';
import axios from 'axios';
import { writeFile } from 'fs/promises';
import { spawn } from 'child_process';
import path from 'path';


const app = express();
const PORT = 3000;

app.use(express.json());

app.post('/data', async (req, res) => {
    try {
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

        res.json(response2.data);
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

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});