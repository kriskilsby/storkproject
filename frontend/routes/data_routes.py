# Handles /get-data and other data-fetching routes.
# Purpose: Contains routes related to data fetching and processing.
# Example code below
from flask import Blueprint, jsonify
from ..services.database import DatabaseHandler

data_bp = Blueprint('data', __name__)

@data_bp.route('/get-data', methods=['GET'])
def get_data():
    db = DatabaseHandler()
    data = db.fetch_data("SELECT * FROM your_table")
    return jsonify(data)
