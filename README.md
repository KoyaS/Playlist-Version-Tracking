# Spotify Playlist Version Tracking

Visit the live site at: http://en-rotation.herokuapp.com/

<img width="1532" alt="Screen Shot 2022-11-26 at 7 59 07 PM" src="https://user-images.githubusercontent.com/39803522/204118677-a3977202-12cf-4efd-86a0-be25212c4b35.png">

A nodejs web/client webapp to help you keep track of the changes you make to playlists. Never forget what songs you delete from the playlist because this keeps track of that too! This project started as a fork of [this Spotify produced OAuth 2.0 demo](https://github.com/spotify/web-api-auth-examples).

Some super helful resources used to make this possible:

* [Boostrap 3.1.1](https://bootstrapdocs.com/v3.1.1/docs/getting-started/)
* [Spotify API / Developer Reference](https://developer.spotify.com/)
* [Firebase Firestore (Persistant user data)](https://firebase.google.com/docs/firestore)
* [DataTables: Free Open-Source Javascript Library](https://datatables.net/)

# To Run This Project Yourself

This server runs on Node.js. On [its website](http://www.nodejs.org/download/) you can find instructions on how to install it. You can also follow [this gist](https://gist.github.com/isaacs/579814) for a quick and easy way to install Node.js and npm.

Once installed, clone the repository and install its dependencies running:

    $ npm install

## Setup With Spotify
You will need to register your own app and get your own credentials from the Spotify for Developers Dashboard.

To do so, go to [your Spotify for Developers Dashboard](https://beta.developer.spotify.com/dashboard) and create your application. Make sure to register at these Redirect URIs:

* http://localhost:8888 (needed for the implicit grant flow)
* http://localhost:8888/callback

Once you have created your app, replace the `client_id`, `redirect_uri` and `client_secret` in the examples with the ones you get from My Applications.

## Setup With Firebase

You will need to register and create a database through Firebase's Developer Dashboard. You may also need to register with the Google Developer Console.

To get started, visit [this get started with Firebase page](https://firebase.google.com/docs/firestore/quickstart?authuser=1).
Also see the [Google Developer Console](https://console.developers.google.com/).

## Running
In order to run, open the folder with the name of the flow you want to try out, and run its `app.js` file. For instance, to run the Authorization Code example do:

    $ cd authorization_code
    $ node app.js

Then, open `http://localhost:8888` in a browser.
