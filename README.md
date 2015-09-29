# agario-client #
Node.js client for [agar.io](http://agar.io) with API.

## Instructions ##
- Install [Node.js](https://nodejs.org/)
- Install client using `npm install agario-client` (ignore `python` errors)
- Run `node ./node_modules/agario-client/example.js` (for testing purpose)
- If it works, you're ready to look at API and code

# API #
There are two types of object that have API:

- **Client** - thing that connects to [agar.io](http://agar.io) server and talks to it. If you want to spawn and control your `Ball`, you need to talk with `Client`
- **Ball** - thing that `Client` creates. Everything in game is `Balls` (viruses/food/players...). You can't control `Balls` objects, only observe what they do.

Both objects have same methods for events from [events.EventEmitter](https://nodejs.org/api/events.html):

- `.on('eventName', callback)` attach listener to event
- `.once('eventName', callback)` attach listener to event but execute only once
- `.removeListener('eventName', callback)` remove listener from event
- `.removeAllListeners('eventName')` remove all listeners from event
- `.emit('eventName', p1, p2...)` emit your own event
- check more in [documentation](https://nodejs.org/api/events.html)

# Client API #
    var AgarioClient = require('agario-client');
    var client = new AgarioClient(client_name); 
*client_name* is string for client that will be used for logging (if you enable it). It's not your ball name.

## Client properties ##
Properties that you can change:

- `client.debug` debug level. 0-5. 0 is completely silent. 5 is super verbose. **Default: 1**
- `client.server` address that was used in `client.connect()` call
- `client.key` key that was used in `client.connect()` call
- `client.facebook_key` key to login. See how to get key in [additional info](#facebook-key).
- `client.inactive_destroy` time in ms for how long ball will live in memory after his last known action (if player exit from game or ball eaten outside our field of view, we will not know it since server sends action only about field that you see. Original code `destroy()` `Ball` when he `disappear` from field of view. You can do that in `client.on('ballDisppear')` if you want it for some reason). **Default: 5\*60\*1000** (5 minutes)
- `client.inactive_check` time in ms for time interval that search and destroy inactive `Balls`. **Default: 10\*1000** (10 seconds)
- `client.spawn_attempts` how much we need try spawn before disconnect (made for unstable spawn on official servers). **Default: 25** 
- `client.spawn_interval` time in ms between spawn attempts. **Default: 200** 

Properties that better not to change or you can break something:

- `client.balls` object with all `Balls` that `client` knows about. Access `Ball` like `client.balls[ball_id]`
- `client.my_balls` array of alive `Ball`'s IDs that `client` owns and can control.
- `client.score` personal score since spawn
- `client.leaders` array of leader's `Balls` IDs in FFA mode. (player can have lots of `Balls`, but sever sends only one ID of one `Ball`)
- `client.teams_scores` array of team's scores in teams mode
- `client.client_name` name that you have set for `client` (not nickname)
- `client.tick_counter` number of *tick* packets received (i call them ticks because they contains information about eating/movement/size/disappear... of `Balls`)

## Client methods ##
- `client.connect(server, key)` connect to [agar.io](http://agar.io) server. Check [Servers](#servers) part in this readme to see how to get server IP and key. **ProTip:** each server have few rooms (if it is not party), so you may need connect few times before you will get in room that you want (but you need new key each time and [agar.io](http://agar.io) can ban your IP for flooding with requests). You can look `client.once('leaderBoardUpdate')` to know if you're connected to correct room
- `client.disconnect()` disconnect from server
- `client.spawn(name)` will spawn `Ball` with nickname. `client.on('myNewBall')` will be called when server sends our `Ball` info. Will return `false` if connection is not established.
- `client.spectate()` will activate spectating mode. Look at `client.on('spectateFieldUpdate')` for FOV updates. Will return `false` if connection is not established.
- `client.moveTo(x,y)` send move command. `x` and `y` is numbers where you want to move. Coordinates (size) of map you can get in `client.on('mapSizeLoad')`. Your `Balls` will move to coordinates you specified until you send new coordinates to move. Original source code do this every **100ms** (10 times in second) and before split and eject. Will return `false` if connection is not established.
- `client.split()` will split your `Balls` in two. `Ball` will be ejected in last direction that you sent with `client.moveTo()`. `client.on('myNewBall')` will be called when server sends our `Balls` info. Will return `false` if connection is not established.
- `client.eject()` will eject some mass from your `Balls`. Mass will be ejected in last direction that you sent with `client.moveTo()`. Ejected mass is `Ball` too (but we don't own them). So `client.on('ballAppear')` will be called when server sends ejected mass `Balls` info. Will return `false` if connection is not established.

## Client events ##
In this list `on.eventName(param1, param2)` means you need to do `client.on('eventName', function(param1, param2) { ... })`

- `on.connecting()` connecting to server
- `on.connected()` connected to server and ready to spawn
- `on.connectionError(err)` connection error
- `on.disconnect()` disconnected
- `on.message(packet)` new packet received from server (check `packet.js`)
- `on.myNewBall(ball_id)` my new `Ball` created (spawn/split/explode...)
- `on.somebodyAteSomething(eater_id, eaten_id)` somebody ate something
- `on.scoreUpdate(old_score, new_score)` personal score updated
- `on.leaderBoardUpdate(old_array, new_array)` leaders update in FFA mode. Array of leader's `Ball`'s IDs (one ID per leader)
- `on.teamsScoresUpdate(old_scores, new_scores)` array of teams scores update in teams mode
- `on.mapSizeLoad(min_x, min_y, max_x, max_y)` map size update (after connect)
- `on.reset()` when we delete all `Balls` and stop timers (connection lost?)
- `on.winner(ball_id)` somebody won and server going for restart
- `on.ballAction(ball_id, coordinate_x, coordinate_y, size, is_virus, nick)` some action about some `Ball`
- `on.ballAppear(ball_id)` `Ball` appear on "screen" (field of view)
- `on.ballDisppear(ball_id)` `Ball` disappear from "screen" (field of view)
- `on.ballDestroy(ball_id, reason)` `Ball` deleted (check [reasons](#ball-destroy-reasons-list) at the bottom of this document)
- `on.mineBallDestroy(ball_id, reason)` mine (your) `Ball` deleted (check reasons at the bottom of this document)
- `on.lostMyBalls()` all mine `Balls` destroyed/eaten
- `on.merge(destroyed_ball_id)` mine two `Balls` connects into one
- `on.ballMove(ball_id, old_x, old_y, new_x, new_y)` `Ball` move
- `on.ballResize(ball_id, old_size, new_size)` `Ball` resize
- `on.ballRename(ball_id, old_name, new_name)` `Ball` set name/change name/we discover name
- `on.ballUpdate(ball_id, old_update_time, new_update_time)` new data about ball received
- `on.spectateFieldUpdate(cord_x, cord_y, zoom_level)` coordinates of field of view in `client.spectate()` mode
- `on.experienceUpdate(level, current_exp, need_exp)` experience information update (if logined with [facebook key](#facebook-key))

# Ball API #
`var ball = client.balls[ball_id];` *ball_id* is number that you can get from events

## Ball properties ##
Properties that you can change:

- None. But you can create properties that don't exists for your needs if you want

Properties that better not to change or you can break something:

- `ball.id` ID of `Ball` (number)
- `ball.name` nickname of player that own the `Ball`
- `ball.x` last known X coordinate of `Ball` (if `ball.visible` is `true` then its current coordinate)
- `ball.y` last known Y coordinate of `Ball` (if `ball.visible` is `true` then its current coordinate)
- `ball.size` last known size of `Ball` (if `ball.visible` is `true` then its current size)
- `ball.mass` mass of ball calculated from `ball.size`
- `ball.color` string with color of `Ball`
- `ball.virus` if `true` then ball is a virus (green thing that explode big balls)
- `ball.mine` if `true` then we do own this `Ball`
- `ball.client` `Client` that knows this `Ball` (if not `ball.destroyed`)
- `ball.destroyed` if `true` then this `Ball` no more exists, forget about it
- `ball.visible` if `true` then we see this `Ball` on our "screen" (field of view)
- `ball.last_update` timestamp when we last saw this `Ball`
- `ball.update_tick` last tick when we saw this `Ball`

## Ball methods ##
- `ball.toString()` will return `ball.id` and `(ball.name)` if set. So you can log `ball` directly
- Other methods is for internal use

## Ball events ##
In this list `on.eventName(param1, param2)` means you need to do `ball.on('eventName', function(param1, param2) { ... })`

 - `on.destroy(reason)` `Ball` deleted (check [reasons](#ball-destroy-reasons-list) at the bottom of this document)
 - `on.move(old_x, old_y, new_x, new_y)` `Ball` move
 - `on.resize(old_size, new_size)` `Ball` resize
 - `on.update(old_time, new_time)` new data about `Ball` received
 - `on.rename(old_name, new_name)` `Ball` change/set name/we discover name
 - `on.appear()` `Ball` appear on "screen" (field of view)
 - `on.disappear()` `Ball` disappear from "screen" (field of view)

# Servers #
When you do `var AgarioClient = require('agario-client');` you can access `AgarioClient.servers` 
Functions need `opt` as options object and `cb` as callback function. 

## Options ##

- `servers.getFFAServer(opt, cb)` to request FFA server.  
  Needs `opt.region`
- `servers.getTeamsServer(opt, cb)` to request teams server.  
  Needs `opt.region`
- `servers.getExperimentalServer(opt, cb)` to request experimental server.  
  Needs `opt.region`  
  **Use at your own risk!** Support of experimental servers are not guaranteed by agario-client!
- `servers.getPartyServer(opt, cb)` to request party server.  
  Needs `opt.party_key`
- `servers.createParty(opt, cb)` to request party server.  
  Needs `opt.region`

Check [region list](#regions-list) below in this file.

## Callbacks ##

Callback will be called with single object that can contain:
- `server` - server's IP:PORT (**add `ws://` before passing to connect()**)
- `key` - server's key
- `error` - error code (`WRONG_HTTP_CODE`/`WRONG_DATA_FORMAT`/`REQUEST_ERROR`)
- `error_source` - error object passed from `req.on.error` when available (for example when `REQUEST_ERROR` happens)
- `res` - response object when available (for example when `WRONG_HTTP_CODE` happens)
- `data` - response data string when available (for example when `WRONG_DATA_FORMAT` happens)

You can check how `example.js` uses this.

# Additional information #

## agario-devtools ##
If you want record/repeat or watch in real time what your client doing through web browser, you might want to check [agario-devtools](https://github.com/pulviscriptor/agario-devtools)

## Regions list ##

- BR-Brazil
- CN-China
- EU-London
- JP-Tokyo
- RU-Russia
- SG-Singapore
- TK-Turkey
- US-Atlanta

## Ball destroy reasons list ##
- `{'reason': 'reset'}` when `client` destroys everything (connection lost?)
- `{'reason': 'inactive'}` when we didn't saw `Ball` for `client.inactive_destroy` ms
- `{'reason': 'eaten', 'by': ball_id}` when `Ball` got eaten
- `{'reason': 'merge'}` when our `Ball` merges with our other `Ball`

## Facebook key ##
Facebook key currently stored in `localStorage` of browser. 
First it was in `JSON.parse(localStorage.loginCache).ga` 
Then in `JSON.parse(localStorage.loginCache).ha`
Last known `JSON.parse(localStorage.loginCache3).authToken` 
To get key, you need 
- Open http://agar.io 
- Log-in through facebook
- Open browser's [JS console](https://webmasters.stackexchange.com/questions/8525/how-to-open-the-javascript-console-in-different-browsers) 
- Paste `JSON.parse(localStorage.loginCache3).authToken` 
- Press `Enter` key on keyboard

If there is no key, then its location may be changed again. Create an [issue](https://github.com/pulviscriptor/agario-client/issues) or [email me](mailto:pulviscriptor@gmail.com). 

## Adding properties/events ##
You can add your own properties/events to clients/balls. 
`var AgarioClient = require('agario-client');`
- Prototype of `Client` is located at `AgarioClient.prototype.` 
- Prototype of `Ball` is located at `AgarioClient.Ball.prototype.` 

For example: 

    AgarioClient.Ball.prototype.isMyFriend = function() { ... };  //to call ball.isMyFriend()
    AgarioClient.prototype.addFriend = function(ball_id) { ... }; //to call client.addFriend(1234) 

Events:

    client.on('somebodyAteSomething', function(eater_id, eaten_id) {  #eat event
        if(client.balls[eaten_id].isMyFriend()) { //if this is my friend
            client.emit('friendEaten', eater_id, eaten_id); //emit custom event
        }
    });
    client.on('friendEaten', function(eater_id, friend_id) { //on friend eaten
        client.log('My friend got eaten!');
    });

Check full example in `example.js`

## Feedback ##
If something is broken, please [email me](mailto:pulviscriptor@gmail.com) or [create issue](https://github.com/pulviscriptor/agario-client/issues/new). I will not know that something is broken until somebody will tell me that.

## License ##
MIT
