# data_model.py - Purpose: Defines a database model for your data.
# Example code below
from . import db

class DataModel(db.Model):
    __tablename__ = 'your_table'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100))
    value = db.Column(db.Float)
