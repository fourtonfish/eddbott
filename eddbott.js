var express = require('express'),
    exphbs  = require('express-handlebars'),
    http = require('http'),
    mysql = require('mysql'),
//    moment = require('moment'),
    RiveScript = require('rivescript'),
    app = express(),
    server = http.Server(app),
    eddbott = {
      brain: new RiveScript(),
      stats: {},
      isAwake: true,
      bedTime: {
        hours: 22
      }
    },
    timers = {
      beat: null,
//      beatDelay: 900000,        // 15 minutes
      beatDelay: 2700000,     // 45 minutes
      checkMentionsQueue: null,
      checkMentionsQueueDelay: 1000,
      checkMentionsQueueDelayMin: 5000,
      checkMentionsQueueDelayMax: 7000,
      timeToTweet: null,
//      timeToTweetDelayMin: 1800,
//      timeToTweetDelayMax: 2700,
      timeToTweetDelayMin: 10800000,  // 3 hours
      timeToTweetDelayMax: 18000000,  // 5 hours
      updateBio: null,
      updateBioDelayMin: 14400000,    // 4 hours
      updateBioDelayMax: 18000000     // 5 hours
//      updateBioDelayMin: 1440,
//      updateBioDelayMax: 1800
    },
    reserved_words = [
      'eddsoundhappy',
      'eddsoundneutral',
      'eddsoundsad',
      'eddlike',
      'eddnolike',
      'eddnohungry',
      'eddveryhungry',
      'eddthankyou',
      'eddthankyoufood',
      'eddinsult'
    ],
    Twit = require('twit'),
    tweetQueue = [],          // A queue of tweets to publish
    mentionsQueue = [],       // A queue of tweets to process
    Q = require('q'),
    config = require('./config');


var AlchemyAPI = require('./alchemyapi');
var alchemyapi = new AlchemyAPI();

var loggingEnabled = true;

eddbott.brain.loadDirectory("brain", loading_done, loading_error);
 
 
eddbott.brain.loadFile([
  "brain/begin.rive",
  "brain/main.rive"
], loading_done, loading_error);

function loading_done (batch_num) {
  eddbott.brain.sortReplies();
}

function loading_error (batch_num, error) {
  console.log("Error when loading files: " + error);
}

var connection = mysql.createConnection({
  host     : 'localhost',
  user     : 'root',
  password : process.env.DB_PASSWORD,
  database : 'eddbott'
});

connection.query('SELECT * from stats', function(err, rows, fields) {
  if (!err){
    eddbott.stats = rows[0];

    if (loggingEnabled === true){
      console.log('eddbott.stats');
      console.log(eddbott.stats);
    }
  }
  else{
    console.log('Error while performing Query.');
    console.log(err);
  }
});

//http://stackoverflow.com/questions/1527803/generating-random-numbers-in-javascript-in-a-specific-range
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function updateEddbottStatsDB(){
  if (eddbott.stats.hunger < 0){
    eddbott.stats.hunger = 0;
  }
  if (eddbott.stats.happiness > 100){
    eddbott.stats.happiness = 100;
  }
  if (eddbott.stats.boredom > 100){
    eddbott.stats.boredom = 100;
  }

  connection.query('UPDATE stats SET happiness=' + eddbott.stats.happiness +
                                  ', hunger=' + eddbott.stats.hunger +
                                  ', boredom=' + eddbott.stats.boredom, 
  function(err, rows, fields) {
    if (err){
      console.log('Error while performing Query.');
      console.log(err);
    }
  });
}

function arrayContains(inputText, checkWords){
  var pass = false;

  try {
    checkWords.forEach(function(word){
      if (inputText.indexOf(word) === -1){
        throw new Error("Missing word");      
      }
      pass = true;
    });
  } catch(e) {
    // NOOP
  }

  return pass;
}

function askEddbott(message){
  var reply;

  switch (true){
    case arrayContains(message, ['how', 'are', 'you']):
      if (eddbott.stats.happiness > 30 && eddbott.stats.boredom < 75){
        reply = eddbott.brain.reply("local-user", 'eddsoundhappy');
      }
      else if (eddbott.stats.happiness <= 30 && eddbott.stats.boredom < 75){
        reply = eddbott.brain.reply("local-user", 'eddsoundsad');
      }
      else{
        reply = eddbott.brain.reply("local-user", 'eddsoundbored');
      }
    break;
    default:
      reply = eddbott.brain.reply("local-user", message);
    break;

  }

  return reply;
}

function checkIfSleeping(){
  var date = new Date(),
      current_hour = date.getHours(),
      current_minute = date.getMinutes();

  if (current_hour >= 8 && (current_hour <= eddbott.bedTime.hours && current_minute < getRandomInt(10, 30))){
    eddbott.isAwake = true;
  }
  else{
    eddbott.isAwake = false;
  }
}

function getSentiment(text){
  var deferred = Q.defer();
  alchemyapi.sentiment('html', text, {}, function(response) {
    //TODO: Error handling!
    if ('docSentiment' in response && 'score' in response.docSentiment){
      deferred.resolve(parseFloat(response.docSentiment.score));
    }
    else{
      deferred.resolve(0);      
    }
  });
  return deferred.promise;
}

function findFoodInImage(url){
  var deferred = Q.defer();
  alchemyapi.image_keywords('url', url, {}, function(response) {
    //TODO: Error handling!
    var image_keywords = response.imageKeywords.map(function(kword){return kword.text});
    if (image_keywords.indexOf('food') > -1){
      deferred.resolve(true);
    }
    else{
      deferred.resolve(false);      
    }

  });
  return deferred.promise;
}

function restartUpdateBioTimer(){
  clearInterval(timers.updateBio);
  timers.updateBio = setInterval(updateBio, getRandomInt(timers.updateBioDelayMin, timers.updateBioDelayMin));
}

function updateBio(){
  var newBio = '';
  switch (true){
    case (eddbott.stats.hunger > 90):
//      https://twittercommunity.com/t/unable-to-update-bio-description-with-emojis/50838
//      newBio = 'HUNGRY ☹☹';
      newBio = 'HUNGRY!!!';
    break;
    case (eddbott.stats.hunger > 80):
//      newBio = 'HUNGRY ☹';
      newBio = 'HUNGRY!!';
    break;
    case (eddbott.stats.hunger > 70):
      newBio = 'HUNGRY';
    break;
    case (eddbott.stats.boredom > 90):
//      newBio = 'BORED ☹☹';
      newBio = 'BORED!!!';
    break;
    case (eddbott.stats.boredom > 80):
//      newBio = 'BORED ☹';
      newBio = 'BORED!!';
    break;
    case (eddbott.stats.boredom > 70):
      newBio = 'BORED';
    break;
    case (eddbott.stats.happiness > 90 && eddbott.stats.boredom < 70):
//      newBio = '☺☺☺☺';
      newBio = ':D :D';
    break;
    case (eddbott.stats.happiness > 50 && eddbott.stats.boredom < 70):
//      newBio = '☺☺☺';
      newBio = ':D';
    break;
    case (eddbott.stats.happiness > 30 && eddbott.stats.boredom < 70):
//      newBio = '☺☺';
      newBio = ':) :)';
    break;
    case (eddbott.stats.happiness <= 30 && eddbott.stats.boredom < 70):
//      newBio = '☹';
      newBio = ':)';
    break;
    default:
      newBio = 'noop';
    break;
  }

  if (newBio !== 'noop'){
    twitter.post('account/update_profile',
    {
      description: newBio
    }, function(err, data, response) {
      if (loggingEnabled === true){
        if (err){
          console.log('ERROR');
          console.log(err);          
        }
        else{
          console.log('Updated bio to: ' + newBio);
        }
      }
    });
  }
}

function timeToTweet(){
  clearInterval(timers.timeToTweet);
  if (eddbott.stats.hunger > 85){
    //TOO HUNGRY TO TWEET!
    tweetQueue.push({
      id: null,
      text: askEddbott('eddveryhungry')
    });    
  }
  else if (eddbott.stats.happiness > 30){
    twitter.get('lists/statuses',
    {
      slug: 'twitterbots',
      owner_screen_name: 'fourtonfish',
      count: 1
    }, function(err, data, response) {
      if (loggingEnabled === true){
        if (err){
          console.log('ERROR');
          console.log(err);          
        }
        else{
          console.log('lists/statuses:');
          console.log(data[0].id_str);
          console.log(data[0].user.screen_name);
          console.log(data[0].text);

/*
    tweetQueue.push({
      id: null,
      text: askEddbott('eddveryhungry')
    });    

*/

        }
      }
    });
  }    //else => Too sad to tweet.

  timers.timeToTweet = setInterval(timeToTweet, getRandomInt(timers.timeToTweetDelayMin, timers.timeToTweetDelayMax));  
}

function checkMentionsQueue(){
  if (loggingEnabled === true){
    console.log('Checking mentions queue...');
  }

  if (mentionsQueue.length > 0){
    var tweet = mentionsQueue.shift();

    var run_commands = [];

    if (tweet.text.length > 10) {
      //TODO: This should probably only run if there is an actual text.
      //Basically, check if tweet is longer than @eddbott + url of an image
      run_commands.push(getSentiment(tweet.text));
    }

    if ('media' in tweet.entities){
      //TODO: This only supports one image at a time (the first one).
      //Consider iterating through an array of all images.
      console.log(tweet.entities.media[0].media_url);
      run_commands.push(findFoodInImage(tweet.entities.media[0].media_url));
    }

    Q.all(run_commands).then(function(results){
      console.log('RESULTS:');
      console.log(results);

      var tweet_sentiment = results[0],
          image_contains_food = results[1],
          tweet_response;

      if (image_contains_food === true && tweet_sentiment >= 0){
        if (eddbott.stats.hunger > 25){
          eddbott.stats.hunger-=getRandomInt(10, 20);
          updateEddbottStatsDB();
          tweet_response = askEddbott('eddthankyoufood');          
        }
        else{
          tweet_response = askEddbott('eddnohungry');          
        }
      }
      else {
        if(tweet_sentiment < 0){
          tweet_response = askEddbott('eddinsult');
        }
        else{
          tweet_response = askEddbott(tweet.text);        
        }
      }

      var new_tweet = {
        id: tweet.id_str,
        text: '@' + tweet.user.screen_name + ' ' + tweet_response
      };

      if (loggingEnabled === true){
        console.log('Adding response to queue:');
        console.log(new_tweet.text);
      }
      tweetQueue.push(new_tweet);
    });
    setTimeout(function(){
      checkMentionsQueue();
    }, getRandomInt(timers.checkMentionsQueueDelayMin, timers.checkMentionsQueueDelayMax));
  }
  else{
    if (loggingEnabled === true){
      console.log('Mentions queue is empty.');
    }
  }
}

function checkTweetQueue(){
  if (tweetQueue.length > 0){
    var newTweet = tweetQueue.shift();
    if (loggingEnabled === true){
      console.log('Posting new tweet:');
      console.log(newTweet);    
    }

    twitter.post('statuses/update',
    {
      status: newTweet.text,
      in_reply_to_status_id: newTweet.id
    }, function(err, data, response) {
      if (loggingEnabled === true){
        if (err){
          console.log('ERROR');
          console.log(err);          
        }
        else{
          console.log('NO ERROR');          
        }
      }
    });
  }

  setTimeout(function(){
    checkTweetQueue();
  }, getRandomInt(5000, 7000));
}


var twitter = new Twit(config.twitter),
    stream_eddbott = twitter.stream('user'),
    stream_public = twitter.stream('statuses/filter', { track: '@eddbott' });

stream_public.on('tweet', function (tweet) {
  if (loggingEnabled === true){
    console.log('New tweet!');
    console.log(tweet.id + ': ' + tweet.text);
  }

  if (new RegExp(reserved_words.join("|")).test(tweet.text)) {
    //TODO: One of the reserved words was used. Ignore? Tweet something back?
  }
  else{
    mentionsQueue.push(tweet);
    setTimeout(function(){
      checkMentionsQueue();
    }, getRandomInt(timers.checkMentionsQueueDelayMin, timers.checkMentionsQueueDelayMax));
  }
});

stream_eddbott.on('favorite', function (tweet) {
  eddbott.stats.happiness += getRandomInt(1, 2);
  updateEddbottStatsDB();
  if (loggingEnabled === true){
    console.log('New favorite!');
  }
});

stream_eddbott.on('follow', function (tweet) {
  eddbott.stats.happiness += getRandomInt(1, 4);
  updateEddbottStatsDB();
  if (loggingEnabled === true){
    console.log('New follower!');
  }
});

checkIfSleeping();
checkTweetQueue();
checkMentionsQueue();
timeToTweet();
restartUpdateBioTimer();

timers.beat = setInterval(function(){
  if (eddbott.stats.happiness <= 100){
    eddbott.stats.happiness--;
  }
  if (eddbott.stats.hunger <= 90){
    eddbott.stats.hunger += getRandomInt(0, 10);
  }
  if (eddbott.stats.boredom < 100){
    eddbott.stats.boredom++;
  }
  if (loggingEnabled === true){
    console.log('eddbott.stats:');
    console.log(eddbott.stats);
  }
  updateEddbottStatsDB();
}, timers.beatDelay);


app.engine('handlebars', exphbs({defaultLayout: 'main'}));
app.set('views', __dirname + '/views');
app.set('view engine', 'handlebars');

app.get('/', function (req, res) {
  res.render('index');
});

app.get('/hello', function (req, res) {
  //TODO: This testing section needs a complete rewrite to match the latest code updates.
  var message = req.query.message;
  if (message !== undefined){
    Q.all([
      askEddbott(message),
      getSentiment(message),
//      findFoodInImage('http://cdn2.norecipes.com/wp-content/uploads/2012/10/spaghetti-recipe-5.jpg?ae258a')
      findFoodInImage('http://globe-views.com/dcim/dreams/car/car-06.jpg')
    ]).then(function(results){
      res.header('Cache-Control', 'max-age=1');
      res.json({
        eddbott_stats: eddbott.stats,
        response: results[0],
        sentiment: results[1],
        image_contains_food: results[2]
        }
      );
    });
  }
  else{
    res.redirect('/');
  }
});

app.use(express.static(__dirname + '/public'));

server.listen(3009, function(){
  console.log('Express server listening on port 3009');
});
