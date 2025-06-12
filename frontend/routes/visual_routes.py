# Handles /update-visual and map-related routes.
# Purpose: Contains routes related to visualization tasks.
# Example code below
from flask import Blueprint, render_template
from ..services.clustering import ClusterProcessor

visual_bp = Blueprint('visual', __name__)

@visual_bp.route('/update-visual', methods=['GET'])
def update_visual():
    processor = ClusterProcessor()
    map_html = processor.create_map()
    return render_template('map.html', map_html=map_html)
