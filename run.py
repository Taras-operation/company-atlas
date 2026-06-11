import os

from app import create_app

app = create_app()

if __name__ == "__main__":
    # Port 5000 is hijacked by macOS AirPlay Receiver, so default to 5001 locally.
    port = int(os.environ.get("PORT", 5001))
    app.run(debug=True, port=port)
