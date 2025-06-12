### server.py script ###
import os
from flask import Flask
from flask_cors import CORS
import subprocess
import psycopg2
import pandas as pd
from sklearn.cluster import KMeans

# Set the FLASK_DEBUG environment variable to 1 for enabling debug mode
os.environ["FLASK_DEBUG"] = "1"

app = Flask(__name__)	# Create an instance of Flask class
CORS(app)				# Enables frontend to make request to backend

#Add a simple homepage route
@app.route('/')
def home():
    return "Flask server is running on port 8100!"

# Route setup in Flask server to listen for GET requests 
@app.route('/run-script', methods=['GET']) 	#URL = 'http://127.0.0.1:5000/run-script'
# Route setup workflow
def run_script():
	try:
		# Subprocess - run the external Python script and capture the output
		result = subprocess.run(['python3', 'run_script.py'], capture_output=True, text=True)

		# Return the output of the script as the response 
		if result.returncode == 0:
			return f"Script ran successfully! Output: <pre>{result.stdout}</pre>", 200
		else:
			# Error handling returning standard error message with 500 status code
			return f"Error running the script: {result.stderr}", 500
	# Exception message handling with a 500 status code		
	except Exception as e:
		return f"Error: {e}", 500

# EXAMPLE Database connection
def get_db_connection():
    conn = psycopg2.connect(
        host="your_host",
        database="your_database",
        user="your_user",
        password="your_password"
    )
    return conn


# Check this script is being run directly and starts the Flask server
if __name__ == '__main__':
    # app.run(debug=True)
	app.run(host="0.0.0.0", port=8100, debug=True)