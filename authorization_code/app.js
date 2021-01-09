/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/web-api/authorization-guide/#authorization_code_flow
 */

var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var cors = require('cors');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
const { access } = require('fs');
const { url } = require('inspector');
const admin = require('firebase-admin');
const serviceAccount = require('./spotifysnapshotvis-300423-5ae2e93ae747.json');
const { table } = require('console');

// Initializing firebase firestore instance
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// These are secret, move them to .env file before putting this project public
var client_id = '***REMOVED***'; // Your client id
var client_secret = '***REMOVED***'; // Your secret
var redirect_uri = 'http://localhost:8888/callback'; // Your redirect uri

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function (length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(__dirname + '/public'))
  .use(cors())
  .use(cookieParser());

app.get('/login', function (req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = 'user-read-private user-read-email';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

var access_token = '';
var refresh_token = '';
var userprofiledata;

app.get('/callback', async (req, res) => {

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);

    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, async (error, response, body) => {
      if (!error && response.statusCode === 200) {

        access_token = body.access_token;
        refresh_token = body.refresh_token;

        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        console.log('Access Token: ' + access_token + '\n');

        // use the access token to access the Spotify Web API
        request.get(options, async (error, response, body) => {
          console.log(body);
          userprofiledata = body;

          const userRoot = await db.collection('users').doc(userprofiledata.id).get();
          if (!userRoot.exists) { // If this is the first time the user has logged in
            await userRoot.ref.set({ // Initialize the user's document
              'firstLoginTimeMillis': Date.now().toFixed()
            }, { 'merge': true });

            // const userPlaylists = await userRoot.ref.collection('playlists');
          }
        });

        // we can also pass the token to the browser to make requests from there
        res.redirect('/#' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          }));



      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

app.get('/refresh_token', function (req, res) {

  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function (error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
});

app.get('/addsong', async (req, res) => {

  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: {
      'Authorization': 'Bearer ' + access_token
    },
    json: true,
    form: {
      "playlist_id": req.query.playlistID,
      "uris": [req.query.songUri],
    }
  };

  req.post(authOptions, function(error, response, body){
    console.log(response);
  });

  res.send({});
});

app.get('/chart', async (req, res) => {

  // HTTP Request For Playlist Data ---------------------------------
  var playlistID = req.query.playlistID;

  request.get({
    url: 'https://api.spotify.com/v1/playlists/' + playlistID,
    json: true,
    headers: {
      'Authorization': 'Bearer ' + access_token
    }
  }, async (error, response, body) => {
    var tracks = body['tracks']['items'];
    var trackNames = [];

    for (let step = 0; step < tracks.length; step++) {
      trackNames.push(tracks[step]['track']['name']);
    }

    // Add these to persitent records and construct chart data

    const playlistSnapshot = await db.collection('users').doc(userprofiledata.id).collection('playlists').doc(playlistID).get();

    // Variables are declared on this level to be accessed later by UI table data constructing code
    var newVersions;
    var newAllSongsAllTime;
    if (playlistSnapshot.exists) {
      const versions = playlistSnapshot.get('versions');
      const allSongsAllTime = playlistSnapshot.get('allSongsAllTime');

      // Add any new songs to allSongsAllTime array
      newAllSongsAllTime = [...allSongsAllTime];
      for (var song of trackNames) {
        if (!(newAllSongsAllTime.includes(song))) {
          newAllSongsAllTime.push(song);
        }
      }
      await playlistSnapshot.ref.update({
        'allSongsAllTime': newAllSongsAllTime
      });

      // Check if the current version of the playlist has any different songs (don't care about reorder) than the previous, most recent version
      newVersions = versions;
      var mostRecentVersion = versions[versions.length - 1]['tracks']; // array of songs last saved when user logged in having made changes
      if (trackNames.length == mostRecentVersion.length) {
        const filteredArray = trackNames.filter(value => mostRecentVersion.includes(value));
        if (filteredArray.length == trackNames.length) {
          // This current playlist version is the same as the previous version
          console.log('this version is the same as the previous version, doing nothing');
        }
      } else {
        // This current playlist version is different than the previous version, add this as a new version
        console.log('this version is not the same as the previous version, pushing change');

        const newVersion = {
          'createdTimeMillis': Date.now().toFixed(),
          'tracks': trackNames
        }

        // Adding new version to the old versions array to be pushed to database. 
        // UI table data constructing code uses this variable assuming that this is the current version
        // of the database. This can cause problems if there is an uncaught error while updating the database
        newVersions.push(newVersion);

        await playlistSnapshot.ref.update({
          'versions': newVersions
        });
        console.log(newVersions);
      }

    } else { // Playlist records don't exist, never been accessed before; create new record for playlist 
      // Note: Also see above comment (newVersions.push(newVersion);)
      // UI table data constructing code uses newVersions assuming that this is the current version
      // of the database. This can cause problems if there is an uncaught error while updating the database
      newVersions = [{
        'createdTimeMillis': Date.now().toFixed(),
        'tracks': trackNames
      }];
      newAllSongsAllTime = [...trackNames];

      await playlistSnapshot.ref.set({
        'name': body.name,
        'firstAccessed': Date.now().toFixed(),
        'allSongsAllTime': trackNames,
        'versions': newVersions
      }, { 'merge': true });
    }

    // Construct data in a way that can be directly passed into front end table UI element
    var olderVersions = [...newVersions]; // Create a clone; currentVersions shouldn't be a pointer
    var current_version = olderVersions.pop(); // Remove the last version (current playlist state) from the list of versions

    const trueColor = '#1ed760';
    const falseColor = '#121212';

    // Creating true/false entries for all versions for all songs that are currently in the playlist
    var currentSongs = [];
    for (var trackName of current_version['tracks']) {
      var rowData = { 'name': trackName };
      for (var olderVersion of olderVersions) {
        if (olderVersion['tracks'].includes(trackName)) {
          rowData[olderVersion['createdTimeMillis']] = trueColor; // true
        } else {
          rowData[olderVersion['createdTimeMillis']] = falseColor; // false
        }
      }
      rowData[current_version['createdTimeMillis']] = trueColor; // true
      currentSongs.push(rowData);
    }

    // Creating true/false entries for all versions for all songs which used to be in the playlist and aren't anymore
    var oldSongs = [];
    for (var trackName of newAllSongsAllTime) {
      var rowData = { 'name': trackName };
      if (!current_version['tracks'].includes(trackName)) { // For all the songs that aren't included in the above loop of current_version
        for (var olderVersion of olderVersions) {
          if (olderVersion['tracks'].includes(trackName)) {
            rowData[olderVersion['createdTimeMillis']] = trueColor; // true
          } else {
            rowData[olderVersion['createdTimeMillis']] = falseColor; // false
          }
        }
        rowData[current_version['createdTimeMillis']] = falseColor; // false
        oldSongs.push(rowData);
      }
    }

    res.send({ // Sends data to frontend of application
      currentSongs: currentSongs,
      oldSongs: oldSongs,
      playlistReqBody: body
    });
    // res.redirect('/chart');

  }); // End HTTP Request Callback ----------------------------------


});

console.log('Listening on 8888');
app.listen(8888);
