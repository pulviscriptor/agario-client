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