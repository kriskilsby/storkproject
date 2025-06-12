# tests/ Directory - Contains unit and integration tests.
# Purpose: Tests the routes.
# Example code below
import unittest
from app import create_app

class TestRoutes(unittest.TestCase):
    def setUp(self):
        self.app = create_app().test_client()

    def test_get_data(self):
        response = self.app.get('/get-data')
        self.assertEqual(response.status_code, 200)
