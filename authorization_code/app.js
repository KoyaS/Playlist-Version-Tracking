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
  var scope = 'user-read-private user-read-email playlist-modify-private playlist-modify-public';
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
    url: 'https://api.spotify.com/v1/playlists/' + req.query.playlistID + '/tracks',
    headers: {
      'Authorization': 'Bearer ' + access_token,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: {
      uris: [req.query.songUri],
    },
    json: true
  };

  request.post(authOptions, function (error, response, body) {
    res.send(body);
  });
});

app.get('/deletesong', async (req, res) => {
  var authOptions = {
    url: 'https://api.spotify.com/v1/playlists/' + req.query.playlistID + '/tracks',
    headers: {
      'Authorization': 'Bearer ' + access_token,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: {
      tracks: [{ uri: req.query.songUri }],
    },
    json: true
  };

  request.delete(authOptions, function (error, response, body) {
    res.send(body);
  });
});

// Taking this out of the current build because there's a limit on the header size which means theoretically if you added/removed
// too many songs at once then there would be a problem. Was meant to act as a user-exits-page cleanup function
// // Currently doesn't update all songs all time. A future upgrade might allow you to search songs on spotify in 
// // which case this would be necessary because new music would be introduced.
// app.get('/saveversion', async (req, res) => { 

//   console.log('here');
//   console.log(req.query.playlistID);

//   const versionSnapshot = await db.collection('users').doc(userprofiledata.id).collection('playlists').doc(req.query.playlistID).get('versions');

//   console.log(versionSnapshot);
//   console.log('---------------');
//   console.log(req.query.currentSongs);
//   console.log('---------------');
//   console.log(req.query.currentSongObjects);
// });

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
    var trackObjects = [];

    // Process the playlist request into data we can use
    for (let step = 0; step < tracks.length; step++) {
      trackNames.push(tracks[step]['track']['name']);
      trackObjects.push(tracks[step]);
    }

    // Add these to persitent records and construct chart data
    // Variables are declared on this level to be accessed later by UI table data constructing code
    var newVersions;
    var newAllTrackNamesAllTime;
    var newAllTrackObjectsAllTime;
    const playlistSnapshot = await db.collection('users').doc(userprofiledata.id).collection('playlists').doc(playlistID).get();
    if (playlistSnapshot.exists) {
      const versions = playlistSnapshot.get('versions');
      const allSongsAllTime = playlistSnapshot.get('allSongsAllTime'); // Returns object: {'trackNames':[], 'trackObjects':[{},{}]}

      // Add any new songs to allSongsAllTime array
      newAllTrackNamesAllTime = [...allSongsAllTime['trackNames']];
      newAllTrackObjectsAllTime = [...allSongsAllTime['trackObjects']];

      for (let i = 0; i < trackNames.length; i++) {
        var trackName = trackNames[i];
        if (!(newAllTrackNamesAllTime.includes(trackName))) {
          newAllTrackNamesAllTime.push(trackName);
          newAllTrackObjectsAllTime.push(trackObjects[i]);
        }
      }
      await playlistSnapshot.ref.update({
        'allSongsAllTime': {
          'trackNames': newAllTrackNamesAllTime,
          'trackObjects': newAllTrackObjectsAllTime
        }
      });

      // Check if the current version of the playlist has any different songs (don't care about reorder) than the previous, most recent version
      newVersions = [...versions];
      var mostRecentVersionTrackNames = versions[versions.length - 1]['tracks']['trackNames']; // array of songs last saved when user logged in having made changes
      if (trackNames.length == mostRecentVersionTrackNames.length) { // If this playlist version is the same as previous version
        const filteredArray = trackNames.filter(value => mostRecentVersionTrackNames.includes(value));
        if (filteredArray.length == trackNames.length) {
          // This current playlist version is the same as the previous version
          console.log('this version is the same as the previous version, doing nothing');
        }
      } else {
        // This current playlist version is different than the previous version, add this as a new version
        console.log('this version is not the same as the previous version, pushing change');

        const newVersion = {
          'createdTimeMillis': Date.now().toFixed(),
          'tracks': {
            'trackNames': trackNames,
            'trackObjects': trackObjects
          }
        }

        // Adding new version to the old versions array to be pushed to database. 
        // UI table data constructing code uses this variable assuming that this is the current version
        // of the database. This can cause problems if there is an uncaught error while updating the database.
        // This would cause the database to not update but the UI would reflect the update
        newVersions.push(newVersion);

        await playlistSnapshot.ref.update({
          'versions': newVersions
        });
      }

    } else { // Playlist records don't exist, never been accessed before; create new record for playlist 
      console.log('this playlist has never been accessed before, creating new records');
      // Note: Also see above comment (newVersions.push(newVersion);)
      // UI table data constructing code uses newVersions assuming that this is the current version
      // of the database. This can cause problems if there is an uncaught error while updating the database
      newVersions = [{
        'createdTimeMillis': Date.now().toFixed(),
        'tracks': {
          'trackNames': trackNames,
          'trackObjects': trackObjects
        }
      }];
      newAllTrackNamesAllTime = [...trackNames];

      await playlistSnapshot.ref.set({
        'name': body.name,
        'firstAccessed': Date.now().toFixed(),
        'allSongsAllTime': {
          'trackNames': trackNames,
          'trackObjects': trackObjects
        },
        'versions': newVersions
      }, { 'merge': true });
    }

    // Construct data in a way that can be directly passed into front end table UI element
    var olderVersions = [...newVersions]; // Create a clone; currentVersions shouldn't be a pointer
    var current_version = olderVersions.pop(); // Remove the last version (current playlist state) from the list of versions

    const trueColor = '#33D0BC'; // Spotify green: #1ed760
    const falseColor = '#121212';

    // Creating true/false entries for all versions for all songs that are currently in the playlist
    var currentSongs = [];
    var currentSongObjects = [];
    for (let i = 0; i < current_version['tracks']['trackNames'].length; i++) {
      var trackName = current_version['tracks']['trackNames'][i];
      var rowData = { 'name': trackName };
      currentSongObjects.push(current_version['tracks']['trackObjects'][i]);
      for (var olderVersion of olderVersions) {
        if (olderVersion['tracks']['trackNames'].includes(trackName)) {
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
    var oldSongObjects = [];
    for (let i = 0; i < newAllTrackNamesAllTime.length; i++) {
      var trackName = newAllTrackNamesAllTime[i];
      var rowData = { 'name': trackName };
      if (!current_version['tracks']['trackNames'].includes(trackName)) { // For all the songs that aren't included in the above loop of current_version
        oldSongObjects.push(newAllTrackObjectsAllTime[i]);
        for (var olderVersion of olderVersions) {
          if (olderVersion['tracks']['trackNames'].includes(trackName)) {
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
      currentSongObjects,
      oldSongs: oldSongs,
      oldSongObjects,
      playlistReqBody: body
    });
    // res.redirect('/chart');

  }); // End HTTP Request Callback ----------------------------------


});

console.log('Listening on 8888');
app.listen(8888);
