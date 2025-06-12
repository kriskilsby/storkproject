# Keep Minimal - The run.py file should only initialize the app and import the routes:
# Example code
import os
from app import create_app

# Set the FLASK_DEBUG environment variable to 1 for enabling debug mode
os.environ["FLASK_DEBUG"] = "1"

app = create_app()

if __name__ == '__main__':
    app.run(debug=True)
