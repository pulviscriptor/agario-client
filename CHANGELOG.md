## 17.11.2015 ##
Code changes:

- `AgarioClient.Ball` added
- Added stability to `spawn()`. By default client will try to spawn 25 times before disconnect
- `on.connected` event is now emited without 2sec delay
- First `spawn()` after connect is now much faster
- Config variable `client.spawn_attempts` added
- Config variable `client.spawn_interval` added
- `example.js` updated with custom events/variables example

## 09.11.2015 ##
Code changes:

- `ball.mass` added

## 13.08.2015 ##
Protocol changes:

- Move packet id `16` coordinates changed from `DoubleLE` to `Int32LE`

## 31.07.2015 ##
Code changes:
Deprecated on `04.06.2015` functions removed:

- function `Client.off` removed
- function `Client.offAll` removed
- function `Client.emitEvent` removed

## 23.07.2015 ##
Code changes:

`var AgarioClient = require('agario-client');`

- `AgarioClient.servers.getFFAServer` added
- `AgarioClient.servers.getTeamsServer` added
- `AgarioClient.servers.getExperimentalServer` added
- `AgarioClient.servers.getPartyServer` added
- `AgarioClient.servers.createParty` added
- `example.js` is now using `AgarioClient.servers.getFFAServer`

## 18.07.2015 ##
Protocol changes:

- Initial packet id `254` sends `05` instead `04` which forces server to use new protocol
- Tick packet id `16` part 2 now uses `SInt32LE` for coordinates

## 17.07.2015 ##
Code changes:

- `Client.facebook_key` added to login with facebook key
- `Client.on.experienceUpdate(level, current_exp, need_exp)` experience information update (if logined)

## 24.06.2015 ##
Protocol changes:

- Initial packet id 255 changed from `0xFF33189283` to `0xFF23123809`
- Server will disconnect you if you send old packet

## 23.06.2015 ##
Protocol changes:

- Initial packet id 255 changed from `0xFF29282828` to `0xFF33189283`
- Server will disconnect you if you send old packet

## 21.06.2015 ##
<sub><sup><sub><sup>Today is a bad day</sup></sub></sup></sub>
Protocol changes:

- Now website sends server and server's key without which you will not be accepted by server
- New packet id 80 that used for sending server's key to server

Code changes:

- `Client.connect(server)` changed to `Client.connect(server, key)`
- Initial packet id 255 changed to simulate original code
- Initial packets 254 and 80 added
- `connected` event is now calling with 2000ms delay otherwise server will ignore spawn packet

## 13.06.2015 ##
Code changes:

- `Client.spectate()` added (by [RouxRC](https://github.com/RouxRC))
- `Client.on.spectateFieldUpdate(cord_x, cord_y, zoom_level)` added

## 08.06.2015 ##
Protocol changes:

- New packet id 240 that moves offset (why, agar? what for?)

Code changes:

- New packet management architecture
- [buffer-dataview](https://github.com/TooTallNate/node-buffer-dataview) not used anymore

## 07.06.2015 ##
`agario-client` added to [NPM](https://www.npmjs.com/package/agario-client)

## 06.06.2015 ##
Code changes:

- `Client.score` added (by [GeoffreyFrogeye](https://github.com/GeoffreyFrogeye))
- `Client.on.scoreUpdate(old_score, new_score)` added (by [GeoffreyFrogeye](https://github.com/GeoffreyFrogeye))

## 04.06.2015 ##
Code changes:

- `Ball.color` is now working (fixed by [GeoffreyFrogeye](https://github.com/GeoffreyFrogeye))
- New events methods (improved by [GeoffreyFrogeye](https://github.com/GeoffreyFrogeye))
- Deprecated property `Ball.is_virus` completely removed
- Deprecated property `Ball.is_mine` completely removed
- `.off()` marked as deprecated and replaced with `.removeListener()`
- `.offAll()` marked as deprecated and replaced with `.removeAllListeners()`
- `.emitEvent()` marked as deprecated and replaced with `.emit()`
- `Client.server` added

## 01.06.2015 ##
Protocol changes:

- `ball` coordinates changed from 32bit float to 16bit signed integer
- `ball` size changed from 32bit float to 16bit signed integer
- packet ID 16 part 3 changed from list of visible balls to list of destroyed balls
- two bits between 2 and 3 part of packet 16 is not sent anymore

## 18.05.2015 ##
Now `example.js` will automatically request server and connect to it.

## 12.05.2015 ##
Protocol changes:

- `ball` coordinates changed from 64bit float to 32bit float
- `ball` size changed from 64bit float to 32bit float
- color is now generating on server and sent to client
- new packet 72 that not used in original code
- new packet 50 used for teams scores in teams mode

Code changes:

- color is now stored in `Ball.color`
- added empty processor for packet ID 72 (packet not used in original code)
- added `Client.teams_scores` property for teams mode
- added `Client.on.teamsScoresUpdate(old_scores, new_scores)` event for teams mode
