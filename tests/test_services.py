# tests/ Directory - Contains unit and integration tests.
# Purpose: Tests the service classes.
# Example code below
import unittest
from app.services.database import DatabaseHandler

class TestDatabaseHandler(unittest.TestCase):
    def test_fetch_data(self):
        db = DatabaseHandler()
        data = db.fetch_data("SELECT 1")
        self.assertIsNotNone(data)
