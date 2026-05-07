from flask import Flask, jsonify, render_template, request
from generator import generate_level

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/level')
def api_level():
    difficulty = int(request.args.get('difficulty', 1))
    difficulty = max(1, min(difficulty, 7))
    level = generate_level(difficulty)
    return jsonify(level)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
