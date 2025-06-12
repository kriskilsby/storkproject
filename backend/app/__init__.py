# The app/ directory is the core of your Flask application. It contains all the logic, routes, models, and services.
# Purpose: Initializes the Flask app and extensions with all routes and configurations.
# Example code below
from flask import Flask
from flask_cors import CORS

def create_app():
    app = Flask(__name__)
    CORS(app)  # Enable Cross-Origin Resource Sharing

    # Register Blueprints
    from .routes.data_routes import data_bp
    from .routes.visual_routes import visual_bp

    app.register_blueprint(data_bp)
    app.register_blueprint(visual_bp)

    return app
