from flask import Flask, flash, redirect, render_template, request, session, abort
from extras import *
import numpy as np, pandas as pd, flask as f, os, csv, random, shutil, datetime
from cs50 import SQL
from werkzeug.security import generate_password_hash, check_password_hash
from flask_session import Session
from pathlib import Path
app = Flask(__name__)
app.config["SESSION_PERMANENT"] = False
app.config["SESSION_TYPE"] = "filesystem"
Session(app)
db = SQL("sqlite:///database.db")

@app.after_request
def after_request(response):
    """Ensure responses aren't cached"""
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Expires"] = 0
    response.headers["Pragma"] = "no-cache"
    return response


@app.errorhandler(405)
def methodnotallowed(e):
    return render_template("errors/405.html")

@app.errorhandler(400)
def baduser(e):
    return render_template("errors/400.html")

@app.errorhandler(404)
def not_found(e):
    print(session["user_id"])
    return render_template("errors/404.html")

@app.errorhandler(451)
def not_found(e):
    return render_template("errors/451.html")


@app.route("/")
@login_required
def index():
    return render_template("index.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    verdict = ""
    if request.method == "POST":
        verdict = ""
        if not request.form.get("username") or not request.form.get("password"):
            abort(400)
        username = db.execute(
            "SELECT * FROM users WHERE username = ?", request.form.get("username")
        )

        print(username)
        if len(username) != 1 or not check_password_hash(
            username[0]["hash"], request.form.get("password")
        ):
            print("failed")
            verdict = "Incorrect username or password."
            return render_template("login.html", verdict=verdict)
        session["user_id"] = username[0]["id"]
        return redirect("/")

    return render_template("login.html", verdict=verdict)


@app.route("/logout")
def logout():
    session.clear()
    return redirect("/"), 301


@app.route("/agenda", methods=["GET", "POST"])
@login_required
def agenda():
    return render_template("agenda1.html")

@app.route("/agenda/", methods=["GET", "POST"])
@login_required
def mistaken_path():
    return redirect("/agenda")


@app.route("/agenda/2", methods=["GET", "POST"])
@login_required
def step2():
    meetingType = request.args.get("meetingType")
    educatorType = request.args.get("educator")
    if not meetingType and not educatorType:
        abort(400)
    if meetingType == "normal":
        normalmeeting(db)
        return render_template("agenda2.html")
    elif meetingType == "education":
        edumeeting(db)
        return render_template("agenda2edu.html")
    #     return redirect("/agenda/2_edu")
    # elif not meetingType and educatorType:
    #     edumeeting(db)
    #     return render_template("agenda2_edu.html")
    # return render_template("placeholder.html")

# @app.route("/agenda/2_edu")
# @login_required
# def edustep2():
#     return render_template("agenda1edu.html")
@app.route("/agenda/3", methods=["GET", "POST"])
@login_required
def step3():
    if request.method != "POST":
        abort(400)
    return render_template("test.html", verdict=request.form.get("meettype"))



@app.route("/admin", methods=["GET", "POST"])
@admin_login_required
def admin():
    return render_template("placeholder.html")


if __name__ == '__main__':
    app.run(debug=True, use_reloader=False)