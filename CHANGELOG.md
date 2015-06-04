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