# @EDDBOTT

**NOTE: THIS IS A VERY EARLY, WORK-IN-PROGRESS VERSION. ALSO, THE BOT IS NOT ACTIVE RIGHT NOW.**

I am making the source code publicly because I just don't have enough time to work on all my side projects. It would be great if someone was interested in collaborating on this.

Below are hastily written instructions and notes. You can reach out to me on [Twitter](https://twitter.com/fourtonfish), [via email](mailto:stefan@fourtonfish.com) or even better, find me on [Botmakers.org](https://botmakers.org/).

Also, there might be some "resident code and files", usually I just copy my previous project and build on top of that.

## THE IDEA

The original idea was a "Twitter-powered multiplayer [Tamagotchi](https://en.wikipedia.org/wiki/Tamagotchi)".

[@eddbott](https://twitter.com/eddbott) is a bot "pretending to be a conscious Twitter bot". It has basic stats, some of which decrease over time, some increase in response to new followers, favorites, etc.


```
eddbott.stats = {
  happiness: 100,
  hunger: 0,
  boredom: 0
}
```

![](/other/eddbott-no-hungry.png)

**@eddbott** can detect if a tweet contains an image of food (here's an [example interaction](https://twitter.com/eddbott/status/641075206208024577); the bot wasn't "hungry", so it didn't eat) and if the accompanying message is positive, it will "accept the food", which will decrease the ```eddbott.stats.hunger```. And if, for example, you tweet an image of a slice of cake and say "Choke on this, you bastard", it won't accept the food.

Originally, the bot was supposed to tweet content of either of the ```sad``` or ```happy``` DB table, based on the happiness level. The DB tables were to contain mostly links/images ('happy') or links to The Smiths songs ('sad').

Ultimately I decided to retweet [selected botALLY bots](https://twitter.com/fourtonfish/lists/eddbottandfriends) if **@eddbott** is "happy".

**@eddbott** will update its bio/description based on mood (originally I wanted to use emojis, but [there seems to be an odd bug](https://twittercommunity.com/t/unable-to-update-bio-description-with-emojis/50838) preventing such silliness, oh well). It will also let everybody know when it's unhappy/hungry. It responds with random delays not to appear too "robotic". The stats also increase with a bit of randomness, for example:

```
stream_eddbott.on('favorite', function (tweet) {
  eddbott.stats.happiness += getRandomInt(1, 2);
// ...
});

stream_eddbott.on('follow', function (tweet) {
  eddbott.stats.happiness += getRandomInt(1, 4);
// ...
});

```

And so on.

**@eddbott**'s responses are partially processed directly in the eddbott.js script, for example:

```
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
```

Basically, depending on certain stats, the script will send a "keyword" to its "brain" (powered by [RiveScript](http://www.rivescript.com/)), which in turn will process that keyword, rather than the original message. These keywords are, naturally, blocked from being accepted from Tweets (see `reserved_words`).

## Technical notes, installation

**@eddbott** runs on node.js and uses the awesome [ttezel/twit](https://github.com/ttezel/twit) library. As mentioned above, it uses [RiveScript](http://www.rivescript.com/) to process the responses. [AlchemyAPI](http://www.alchemyapi.com/) is used to process the language and for image recognition. You will need to [apply for a key](http://www.alchemyapi.com/api/register.html) and download the [node.js SDK](http://www.alchemyapi.com/developers/sdks). 

And you will also need to copy ```config-example.js```, rename it to ```config.js```, insert your [Twitter API keys/secrets](https://apps.twitter.com/).

After that, it's just:

```
(sudo) npm install
gulp
```

You will also be able to go to ```localhost:5000/hello?message=do you like pizza``` to test **@eddbott**'s responses (I recommend using something like [JSONView](https://chrome.google.com/webstore/detail/jsonview/chklaanhfefbnpoihckbnefhakgolnmc?utm_source=chrome-app-launcher-info-dialog)).

Oh and don't forget to import ```eddbott.sql``` -- and make sure your DB password is saved in ```process.env.DB_PASSWORD```!

## TO-DO

- ```//TODO``` comments in the source code
- save the mentions queue to DB/file to survive restarts
- let the bot "go to sleep" for eight hours (see ```checkIfSleeping```)
- handle DMs?
- other interactive behavior: tweet an image of a park to take **@eddbott** for a walk? Hmm.
- ???
