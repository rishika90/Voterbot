import sys
from twocaptcha import TwoCaptcha
import os
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("API_KEY")

def solve_captcha(image_path):
    solver = TwoCaptcha(api_key)
    try:
        result = solver.normal(image_path)
        return result['code']
    except Exception as e:
        print(f"Error solving captcha: {e}")
        raise

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python solve_captcha.py <image_path>")
        sys.exit(1)

    image_path = sys.argv[1]
    solution = solve_captcha(image_path)
    print(solution)
