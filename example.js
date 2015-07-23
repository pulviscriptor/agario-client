//this is example of API usage

var region = 'EU-London'; //server region to request

var http = require('http');
var AgarioClient = require('./agario-client.js'); //in your code you should do require('agario-client')

var client = new AgarioClient('worker'); //create new client and call it "worker" (not nickname)
var interval_id = 0; //here we will store setInterval's ID

client.debug = 1; //setting debug to 1 (avaialble 0-5)
client.facebook_key = ''; //you can put here your facebook key. Check in README.md how to get it

client.once('leaderBoardUpdate', function(old, leaders) { //when we receive leaders list. Fire only once
    var name_array = leaders.map(function(ball_id) { //converting leader's IDs to leader's names
        return client.balls[ball_id].name || 'unnamed'
    });

    client.log('leaders on server: ' + name_array.join(', '));
});

client.on('mineBallDestroy', function(ball_id, reason) { //when my ball destroyed
    if(reason.by) {
        console.log(client.balls[reason.by] + ' ate my ball');
    }

    if(reason.reason == 'merge') {
        console.log('my ball ' + ball_id + ' merged with my other ball, now i have ' + client.my_balls.length + ' balls');
    }else{
        console.log('i lost my ball ' + ball_id + ', ' + client.my_balls.length + ' balls left');
    }
});

client.on('myNewBall', function(ball_id) { //when i got new ball
    client.log('my new ball ' + ball_id + ', total ' + client.my_balls.length);
});

client.on('lostMyBalls', function() { //when i lost all my balls
    client.log('lost all my balls, respawning');
    client.spawn('agario-client'); //spawning new ball with nickname "agario-client"
});

client.on('somebodyAteSomething', function(eater_ball, eaten_ball) { //when some ball ate some ball
    var ball = client.balls[eater_ball]; //get eater ball
    if(!ball) return; //if we don't know than ball, we don't care
    if(!ball.mine) return; //if it's not our ball, we don't care
    client.log('I ate ' + eaten_ball + ', my new size is ' + ball.size);
});

client.on('connected', function() { //when we connected to server
    client.log('spawning');
    client.spawn('agario-client'); //spawning new ball
    interval_id = setInterval(recalculateTarget, 100); //we will search for target to eat every 100ms
});

client.on('connectionError', function(e) {
    client.log('Connection failed with reason: ' + e);
    client.log('Server address set to: ' + client.server + ' please check if this is correct and working address');
});

client.on('reset', function() { //when client clears everything (connection lost?)
    clearInterval(interval_id);
});

function recalculateTarget() { //this is all our example logic
    var candidate_ball = null; //first we don't have candidate to eat
    var candidate_distance = 0;
    var my_ball = client.balls[ client.my_balls[0] ]; //we get our first ball. We don't care if there more then one, its just example.
    if(!my_ball) return; //if our ball not spawned yet then we abort. We will come back here in 100ms later

    for(var ball_id in client.balls) { //we go true all balls we know about
        var ball = client.balls[ball_id];
        if(ball.virus) continue; //if ball is a virus (green non edible thing) then we skip it
        if(!ball.visible) continue; //if ball is not on our screen (field of view) then we skip it
        if(ball.mine) continue; //if ball is our ball - then we skip it
        if(ball.size/my_ball.size > 0.5) continue; //if ball is bigger than 50% of our size - then we skip it
        var distance = getDistanceBetweenBalls(ball, my_ball); //we calculate distances between our ball and candidate
        if(candidate_ball && distance > candidate_distance) continue; //if we do have some candidate and distance to it smaller, than distance to this ball, we skip it

        candidate_ball = ball; //we found new candidate and we record him
        candidate_distance = getDistanceBetweenBalls(ball, my_ball); //we record distance to him to compare it with other balls
    }
    if(!candidate_ball) return; //if we didn't find any candidate, we abort. We will come back here in 100ms later

    client.log('closest ' + candidate_ball + ', distance ' + candidate_distance);
    client.moveTo(candidate_ball.x, candidate_ball.y); //we send move command to move to food's coordinates
}

function getDistanceBetweenBalls(ball_1, ball_2) { //this calculates distance between 2 balls
    return Math.sqrt( Math.pow( ball_1.x - ball_2.x, 2) + Math.pow( ball_2.y - ball_1.y, 2) );
}

console.log('Requesting server in region ' + region);
AgarioClient.servers.getFFAServer({region: region}, function(srv) { //requesting FFA server
    if(!srv.server) return console.log('Failed to request server (' + srv.error + ':' + srv.error_source + ')');
    console.log('Connecting to ' + srv.server + ' with key ' + srv.key);
    client.connect('ws://' + srv.server, srv.key); //do not forget to add ws://
});