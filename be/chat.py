import os
import requests
from flask import Flask, request, jsonify
from dotenv import load_dotenv
from google import genai
import ngrok
import time
load_dotenv()

app = Flask(__name__)
ngrok.set_auth_token(os.getenv("NGROK_AUTHTOKEN"))
# Initialize Gemini Client
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# Credentials from Facebook Developer Console
PAGE_ACCESS_TOKEN = os.getenv("FACEBOOK_PAGE_ACCESS_TOKEN")
VERIFY_TOKEN = os.getenv("FACEBOOK_VERIFY_TOKEN", "my_secure_verify_token")

@app.route("/webhook", methods=["GET"])
def verify_webhook():
    """Facebook Webhook verification handshake"""
    mode = request.args.get("hub.mode")
    token = request.args.get("hub.verify_token")
    challenge = request.args.get("hub.challenge")

    if mode and token:
        if mode == "subscribe" and token == VERIFY_TOKEN:
            return challenge, 200
        else:
            return "Verification failed", 403
    return "Hello world", 200

@app.route("/webhook", methods=["POST"])
def handle_messages():
    """Receives incoming messages from Facebook Messenger and replies via Gemini"""
    body = request.get_json()

    if body.get("object") == "page":
        for entry in body.get("entry", []):
            for messaging_event in entry.get("messaging", []):
                
                # Check if the event contains a text message and isn't an echo
                if "message" in messaging_event and "text" in messaging_event["message"]:
                    sender_id = messaging_event["sender"]["id"]
                    message_text = messaging_event["message"]["text"]

                    # Generate reply using Gemini Flash (fast & lightweight)
                    try:
                        response = client.models.generate_content(
                            model="gemini-2.5-flash",
                            contents=message_text,
                        )
                        reply_text = response.text
                    except Exception as e:
                        reply_text = "I'm currently experiencing high traffic. Please try again in a moment."

                    # Send the response back to user via Facebook Graph API
                    send_facebook_message(sender_id, reply_text)

        return "EVENT_RECEIVED", 200
    return "Not Found", 404

def send_facebook_message(recipient_id, text):
    """Sends a message back to the user on Facebook Messenger"""
    url = f"https://graph.facebook.com/v18.0/me/messages?access_token={PAGE_ACCESS_TOKEN}"
    payload = {
        "recipient": {"id": recipient_id},
        "message": {"text": text}
    }
    headers = {"Content-Type": "application/json"}
    requests.post(url, json=payload, headers=headers)
def home():
    return("Hello from local server Ngrok")
if __name__ == "__main__":
    listener = ngrok.forward(5000)
    print(f" * Public URL: {listener.url()}")
    app.run(port=5000)

