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


@app.route("/lock-in", methods=["GET", "POST"])
@login_required
def lockin():
    if request.method == "POST":
        for i in range(10): print("posted")
        df = pd.read_csv("static/temp.csv")
        print(df.to_string())
        try:
            if not dicttakens or not takens:
                abort(400)
        except NameError:
            abort(400)
        now = str(round(datetime.datetime.now().timestamp()))
        print(now)
        for item in dicttakens:
            key = list(item.keys())
            key = key[0]
            print(item)
            name = item[key]
            # confirmation = input("About to update db. Continue? (ENTER ANY VALUE TO CONTINUE)")
            db.execute("UPDATE members SET ? = ? WHERE name = ?", key, now, name)
        
        if not pd.isna(df.at[1, "Name"]):
            now = datetime.datetime.now().strftime("%Y-%m-%d")
            shutil.copy("static/temp.csv", "static/agendalog/agenda-{}.csv".format(now))
            agendaname = "agenda-{}.csv".format(now)
            directory = Path("static/agendalog")
            latest_file = max(directory.glob("*"), key=lambda f: f.stat().st_mtime)
            return render_template("lock-in.html", agendaname=agendaname, download=latest_file)
        else:
            abort(400)
        return redirect("/agenda")
    elif request.method == "GET":
        return redirect("/agenda")
    else:
        abort(405)

@app.route("/admin", methods=["GET", "POST"])
@admin_login_required
def admin():
    return render_template("placeholder.html")