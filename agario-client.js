var WebSocket = require('ws');
var Packet = require('./packet.js');
var servers = require('./servers.js');
var EventEmitter = require('events').EventEmitter;

function Client(client_name) {
    //you can change this values
    this.client_name = client_name;     //name used for log
    this.debug = 1;                     //debug level, 0-5 (5 will output extremely lot of data)
    this.inactive_destroy = 5*60*1000;  //time in ms when to destroy inactive balls
    this.inactive_check = 10*1000;      //time in ms when to search inactive balls

    //don't change things below if you don't understand what you're doing

    this.tick_counter = 0;
    this.inactive_interval = 0; //ID of setInterval()
    this.timer_emit_connected = null; //timer for emitting "connected" event
    this.balls = {};            //all balls
    this.my_balls = [];         //IDs of my balls
    this.score = 0;             //my score
    this.leaders = [];          //IDs of leaders in FFA mode
    this.teams_scores = [];     //scores of teams in Teams mode
    this.facebook_key = null;   //facebook key. Check README.md how to get it

    if(this.debug >= 1)
        this.log('client created');
}

Client.servers = servers;

Client.prototype = {
    connect: function(server, key) {
        var headers = {
            'Origin': 'http://agar.io'
        };

        this.ws = new WebSocket(server, null, {headers: headers});
        this.ws.binaryType = "arraybuffer";
        this.ws.onopen = this.onConnect.bind(this);
        this.ws.onmessage = this.onMessage.bind(this);
        this.ws.onclose = this.onDisconnect.bind(this);
        this.ws.onerror = this.onError.bind(this);
        this.server = server;
        this.key = key;

        if(this.debug >= 1) {
            if(!key) this.log('[warning] You did not specified "key" for Client.connect(server, key)\n' +
                '          If server will not accept you, this may be the problem');
            this.log('connecting...');
        }

        this.emit('connecting');
    },

    disconnect: function() {
        if(this.debug >= 1)
            this.log('disconnect() called');

        this.ws.close();
    },

    onConnect: function() {
        var client = this;

        if(this.debug >= 1)
            this.log('connected to server');

        this.inactive_interval = setInterval(this.detsroyInactive.bind(this), this.inactive_check);

        var buf = new Buffer(5);
        buf.writeUInt8(254, 0);
        buf.writeUInt32LE(5, 1);
        this.send(buf);

        buf = new Buffer(5);
        buf.writeUInt8(255, 0);
        buf.writeUInt32LE(154669603, 1);
        this.send(buf);

        if(this.key) {
            buf = new Buffer(1 + this.key.length);
            buf.writeUInt8(80, 0);
            for (var i=1;i<=this.key.length;++i) {
                buf.writeUInt8(this.key.charCodeAt(i-1), i);
            }
            this.send(buf);
        }
        if(this.facebook_key) {
            buf = new Buffer(1 + this.facebook_key.length);
            buf.writeUInt8(81, 0);
            for (i=1;i<=this.facebook_key.length;++i) {
                buf.writeUInt8(this.facebook_key.charCodeAt(i-1), i);
            }
            this.send(buf);
        }
        this.timer_emit_connected = setTimeout(function() {
            client.timer_emit_connected = null;
            if(client.debug >= 2)
                client.log('emit connected event');
            client.emit('connected');
        }, 2000);
    },

    onError: function(e) {
        if(this.debug >= 1)
            this.log('connection error: ' + e);

        this.emit('connectionError', e);
        this.reset();
    },

    onDisconnect: function() {
        if(this.debug >= 1)
            this.log('disconnected');

        this.emit('disconnect');
        this.reset();
    },

    onMessage: function(e) {
        var packet = new Packet(e);
        var packet_id = packet.readUInt8();
        var processor = this.processors[packet_id];
        if(!processor) return this.log('warning: unknown packet ID(' + packet_id + '): ' + packet.toString());

        if(this.debug >= 4)
            this.log('ACK packet ID=' + packet_id + ' LEN=' + packet.length);
        if(this.debug >= 5)
            this.log('dump: ' + packet.toString());

        this.emit('message', packet);
        processor(this, packet);
    },

    send: function(buf) {
        if(this.debug >= 4)
            this.log('SEND packet ID=' + buf.readUInt8(0) + ' LEN=' + buf.length);

        if(this.debug >= 5)
            this.log('dump: ' + (new Packet(buf).toString()));

        this.ws.send(buf);
    },

    reset: function() {
        if(this.debug >= 3)
            this.log('reset()');

        this.leaders = [];
        this.teams_scores = [];
        this.my_balls = [];
        clearInterval(this.inactive_interval);
        if(this.timer_emit_connected) clearTimeout(this.timer_emit_connected);
        for(var k in this.balls) if(this.balls.hasOwnProperty(k)) this.balls[k].destroy({'reason':'reset'});
        this.emit('reset');
    },

    detsroyInactive: function() {
        var time = (+new Date);

        if(this.debug >= 3)
            this.log('Destroying inactive balls');

        for(var k in this.balls) {
            if(!this.balls.hasOwnProperty(k)) continue;
            var ball = this.balls[k];
            if(time - ball.last_update < this.inactive_destroy) continue;
            if(ball.visible) continue;

            if(this.debug >= 3)
                this.log('Destroying inactive ' + ball);

            ball.destroy({reason: 'inactive'});
        }
    },

    processors: {
        //tick
        '16': function(client, packet) {
            var eaters_count = packet.readUInt16LE();

            client.tick_counter++;

            //reading eat events
            for(var i=0;i<eaters_count;i++) {
                var eater_id = packet.readUInt32LE();
                var eaten_id = packet.readUInt32LE();

                if(client.debug >= 4)
                    client.log(eater_id + ' ate ' + eaten_id + ' (' + client.balls[eater_id] + '>' + client.balls[eaten_id] + ')');

                if(!client.balls[eater_id]) new Ball(client, eater_id);
                client.balls[eater_id].update();
                if(client.balls[eaten_id]) client.balls[eaten_id].destroy({'reason':'eaten', 'by':eater_id});

                client.emit('somebodyAteSomething', eater_id, eaten_id);
            }


            //reading actions of balls
            while(1) {
                var is_virus = false;
                var ball_id;
                var coordinate_x;
                var coordinate_y;
                var size;
                var color;
                var nick = null;

                ball_id = packet.readUInt32LE();
                if(ball_id == 0) break;
                coordinate_x = packet.readSInt32LE();
                coordinate_y = packet.readSInt32LE();
                size = packet.readSInt16LE();

                var color_R = packet.readUInt8();
                var color_G = packet.readUInt8();
                var color_B = packet.readUInt8();

                color = (color_R << 16 | color_G << 8 | color_B).toString(16);
                color = '#' + ('000000' + color).substr(-6);

                var opt = packet.readUInt8();
                is_virus = !!(opt & 1);

                //reserved for future use?
                if (opt & 2) {
                    packet.offset += 4;
                }
                if (opt & 4) {
                    packet.offset += 8;
                }
                if (opt & 8) {
                    packet.offset += 16;
                }

                while(1) {
                    var char = packet.readUInt16LE();
                    if(char == 0) break;
                    if(!nick) nick = '';
                    nick += String.fromCharCode(char);
                }

                var ball = client.balls[ball_id] || new Ball(client, ball_id);
                ball.color = color;
                ball.virus = is_virus;
                ball.setCords(coordinate_x, coordinate_y);
                ball.setSize(size);
                if(nick) ball.setName(nick);
                ball.update_tick = client.tick_counter;
                ball.appear();
                ball.update();

                if(client.debug >= 4)
                    client.log('action: ball_id=' + ball_id + ' coordinate_x=' + coordinate_x + ' coordinate_y=' + coordinate_y + ' size=' + size + ' is_virus=' + is_virus + ' nick=' + nick);

                client.emit('ballAction', ball_id, coordinate_x, coordinate_y, size, is_virus, nick);
            }

            var balls_on_screen_count = packet.readUInt32LE();

            //disappear events
            for(i=0;i<balls_on_screen_count;i++) {
                ball_id = packet.readUInt32LE();

                ball = client.balls[ball_id] || new Ball(client, ball_id);
                ball.update_tick = client.tick_counter;
                ball.update();
                if(ball.mine) {
                    ball.destroy({reason: 'merge'});
                    client.emit('merge', ball.id);
                }else{
                    ball.disappear();
                }
            }
        },

        //update spectating coordinates in "spectate" mode
        '17': function(client, packet) {
            var x = packet.readFloat32LE();
            var y = packet.readFloat32LE();
            var zoom = packet.readFloat32LE();

            if(client.debug >= 4)
                client.log('spectate FOV update: x=' + x + ' y=' + y + ' zoom=' + zoom);

            client.emit('spectateFieldUpdate', x, y, zoom);
        },

        '20': function() {
            //i dont know what this is
            //in original code it clears our balls array, but i never saw this packet
        },

        //new ID of your ball (when you join or press space)
        '32': function(client, packet) {
            var ball_id = packet.readUInt32LE();
            var ball = client.balls[ball_id] || new Ball(client, ball_id);
            ball.mine = true;
            if(!client.my_balls.length) client.score = 0;
            client.my_balls.push(ball_id);

            if(client.debug >= 2)
                client.log('my new ball: ' + ball_id);

            client.emit('myNewBall', ball_id);
        },

        //leaderboard update in FFA mode
        '49': function(client, packet) {
            var users = [];

            var count = packet.readUInt32LE();

            for(var i=0;i<count;i++) {
                var id = packet.readUInt32LE();

                var name = '';
                while(1) {
                    var char = packet.readUInt16LE();
                    if(char == 0) break;
                    name += String.fromCharCode(char);
                }

                users.push(id);
                var ball = client.balls[id] || new Ball(client, id);
                if(name) ball.setName(name);
                ball.update();
            }

            if(JSON.stringify(client.leaders) == JSON.stringify(users)) return;
            var old_leaders = client.leaders;
            client.leaders = users;

            if(client.debug >= 2)
                client.log('leaders update: ' + JSON.stringify(users));

            client.emit('leaderBoardUpdate', old_leaders, users);
        },

        //teams scored update in teams mode
        '50': function(client, packet) {
            var teams_count = packet.readUInt32LE();
            var teams_scores = [];

            for (var i=0;i<teams_count;++i) {
                teams_scores.push(packet.readFloat32LE());
            }

            if(JSON.stringify(client.teams_scores) == JSON.stringify(teams_scores)) return;
            var old_scores = client.teams_scores;

            if(client.debug >= 2)
                client.log('teams scores update: ' + JSON.stringify(teams_scores));

            client.teams_scores = teams_scores;

            client.emit('teamsScoresUpdate', old_scores, teams_scores);
        },

        //map size load
        '64': function(client, packet) {
            var min_x = packet.readFloat64LE();
            var min_y = packet.readFloat64LE();
            var max_x = packet.readFloat64LE();
            var max_y = packet.readFloat64LE();

            if(client.debug >= 2)
                client.log('map size: ' + [min_x, min_y, max_x, max_y].join(','));

            client.emit('mapSizeLoad', min_x, min_y, max_x, max_y);
        },

        //another unknown backet
        '72': function() {
            //packet is sent by server but not used in original code
        },

        '81': function(client, packet) {
            var level = packet.readUInt32LE();
            var curernt_exp = packet.readUInt32LE();
            var need_exp = packet.readUInt32LE();

            if(client.debug >= 2)
                client.log('experience update: ' + [level, curernt_exp, need_exp].join(','));

            client.emit('experienceUpdate', level, curernt_exp, need_exp);
        },

        '240': function(client, packet) {
            packet.offset += 4;
            var packet_id = packet.readUInt8();
            var processor = client.processors[packet_id];
            if(!processor) return client.log('warning: unknown packet ID(240->' + packet_id + '): ' + packet.toString());
            processor(client, packet);
        },

        //somebody won, end of the game (server restart)
        '254': function(client) {
            if(client.debug >= 1)
                client.log(client.balls[client.leaders[0]] + ' WON THE GAME! Server going for restart');

            client.emit('winner', client.leaders[0]);
        }
    },

    updateScore: function() {
        var potential_score = 0;
        for (var i=0;i<this.my_balls.length;i++) {
            var ball_id = this.my_balls[i];
            var ball = this.balls[ball_id];
            potential_score += Math.pow(ball.size, 2);
        }
        var old_score = this.score;
        var new_score = Math.max(this.score, Math.floor(potential_score / 100));

        if (this.score == new_score) return;
        this.score = new_score;
        this.emit('scoreUpdate', old_score, new_score);

        if(this.debug >= 2)
            this.log('score: ' + new_score);

    },

    log: function(msg) {
        console.log(this.client_name + ': ' + msg);
    },

    //functions that you can call to control your balls

    //spawn ball
    spawn: function(name) {
        var buf = new Buffer(1 + 2*name.length);
        buf.writeUInt8(0, 0);
        for (var i=0;i<name.length;i++) {
            buf.writeUInt16LE(name.charCodeAt(i), 1 + i*2);
        }
        this.send(buf);
    },

    //activate spectate mode
    spectate: function() {
        var buf = new Buffer([1]);
        this.send(buf);
    },

    moveTo: function(x, y) {
        var buf = new Buffer(21);
        buf.writeUInt8(16, 0);
        buf.writeDoubleLE(x, 1);
        buf.writeDoubleLE(y, 9);
        buf.writeUInt32LE(0, 17);
        this.send(buf);
    },

    //split your balls
    //they will split in direction that you have set with moveTo()
    split: function() {
        var buf = new Buffer([17]);
        this.send(buf);
    },

    //eject some mass
    //mass will eject in direction that you have set with moveTo()
    eject: function() {
        var buf = new Buffer([21]);
        this.send(buf);
    }
};

function Ball(client, id) {
    if(client.balls[id]) return client.balls[id];

    this.id = id;
    this.name = null;
    this.x = 0;
    this.y = 0;
    this.size = 0;
    this.virus = false;
    this.mine = false;

    this.client = client;
    this.destroyed = false;
    this.visible = false;
    this.last_update = (+new Date);
    this.update_tick = 0;

    client.balls[id] = this;
    return this;
}
Ball.prototype = {
    destroy: function(reason) {
        this.destroyed = reason;
        delete this.client.balls[this.id];
        var mine_ball_index = this.client.my_balls.indexOf(this.id);
        if(mine_ball_index > -1) {
            this.client.my_balls.splice(mine_ball_index, 1);
            this.client.emit('mineBallDestroy', this.id, reason);
            if(!this.client.my_balls.length) this.client.emit('lostMyBalls');
        }

        this.emit('destroy', reason);
        this.client.emit('ballDestroy', this.id, reason);
    },

    setCords: function(new_x, new_y) {
        if(this.x == new_x && this.y == new_y) return;
        var old_x = this.x;
        var old_y = this.y;
        this.x = new_x;
        this.y = new_y;

        if(!old_x && !old_y) return;
        this.emit('move', old_x, old_y, new_x, new_y);
        this.client.emit('ballMove', this.id, old_x, old_y, new_x, new_y);
    },

    setSize: function(new_size) {
        if(this.size == new_size) return;
        var old_size = this.size;
        this.size = new_size;

        if(!old_size) return;
        this.emit('resize', old_size, new_size);
        this.client.emit('ballResize', this.id, old_size, new_size);
        if(this.mine) this.client.updateScore();
    },

    setName: function(name) {
        if(this.name == name) return;
        var old_name = this.name;
        this.name = name;

        this.emit('rename', old_name, name);
        this.client.emit('ballRename', this.id, old_name, name);
    },

    update: function() {
        var old_time = this.last_update;
        this.last_update = (+new Date);

        this.emit('update', old_time, this.last_update);
        this.client.emit('ballUpdate', this.id, old_time, this.last_update);
    },

    appear: function() {
        if(this.visible) return;
        this.visible = true;
        this.emit('appear');
        this.client.emit('ballAppear', this.id);

        if(this.mine) this.client.updateScore();
    },

    disappear: function() {
        if(!this.visible) return;
        this.visible = false;
        this.emit('disappear');
        this.client.emit('ballDisppear', this.id);
    },

    toString: function() {
        if(this.name) return this.id + '(' + this.name + ')';
        return this.id.toString();
    }
};

// Inherit from EventEmitter
for (var key in EventEmitter.prototype) {
    if(!EventEmitter.prototype.hasOwnProperty(key)) continue;
    Client.prototype[key] = Ball.prototype[key] = EventEmitter.prototype[key];
}

module.exports = Client;
