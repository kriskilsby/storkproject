### server.py script ###
from flask import Flask
import subprocess
import pandas as pd
import psycopg2
from sklearn.cluster import KMeans
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route('/run-script', methods=['GET'])
def run_script():
	try:
		# Run the external Python script and capture the output
		result = subprocess.run(['python', 'run_script.py'], capture_output=True, text=True)

		# Return the output of the script as the response
		if result.returncode == 0:
			return f"Script ran successfully! Output: <pre>{result.stdout}</pre>", 200
		else:
			return f"Error running the script: {result.stderr}", 500

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



if __name__ == '__main__':
    app.run(debug=True)