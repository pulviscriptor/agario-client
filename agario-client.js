var WebSocket    = require('ws');
var Packet       = require('./packet.js');
var servers      = require('./servers.js');
var Account      = require('./account.js');
var EventEmitter = require('events').EventEmitter;

function Client(client_name) {
    //you can change these values
    this.client_name      = client_name; //name used for log
    this.debug            = 1;           //debug level, 0-5 (5 will output extremely lots of data)
    this.inactive_destroy = 5*60*1000;   //time in ms when to destroy inactive balls
    this.inactive_check   = 10*1000;     //time in ms when to search inactive balls
    this.spawn_interval   = 200;         //time in ms for respawn interval. 0 to disable (if your custom server don't have spawn problems)
    this.spawn_attempts   = 25;          //how much attempts to spawn before give up (official servers do have unstable spawn problems)
    this.agent            = null;        //agent for connection. Check additional info in README.md
    this.local_address    = null;        //local interface to bind to for network connections (IP address of interface)
    this.headers          = {            //headers for WebSocket connection.
        'Origin': 'http://agar.io'
    };

    //don't change things below if you don't understand what you're doing

    this.tick_counter      = 0;    //number of ticks (packet ID 16 counter)
    this.inactive_interval = 0;    //ID of setInterval()
    this.balls             = {};   //all balls
    this.my_balls          = [];   //IDs of my balls
    this.score             = 0;    //my score
    this.leaders           = [];   //IDs of leaders in FFA mode
    this.teams_scores      = [];   //scores of teams in Teams mode
    this.auth_token        = '';   //auth token. Check README.md for how to get it
    this.auth_provider     = 1;    //auth provider. 1 = facebook, 2 = google
    this.spawn_attempt     = 0;    //attempt to spawn
    this.spawn_interval_id = 0;    //ID of setInterval()
}

Client.prototype = {
    connect: function(server, key) {
        var opt = {
            headers: this.headers
        };
        if(this.agent) opt.agent = this.agent;
        if(this.local_address) opt.localAddress = this.local_address;

        this.ws            = new WebSocket(server, null, opt);
        this.ws.binaryType = "arraybuffer";
        this.ws.onopen     = this.onConnect.bind(this);
        this.ws.onmessage  = this.onMessage.bind(this);
        this.ws.onclose    = this.onDisconnect.bind(this);
        this.ws.onerror    = this.onError.bind(this);
        this.server        = server;
        this.key           = key;

        if(this.debug >= 1) {
            if(!key) this.log('[warning] You did not specified "key" for Client.connect(server, key)\n' +
                '          If server will not accept you, this may be the problem');
            this.log('connecting...');
        }

        this.emitEvent('connecting');
    },

    disconnect: function() {
        if(this.debug >= 1)
            this.log('disconnect() called');

        if(!this.ws) {
            if(this.debug >= 1)
                this.log('[warning] disconnect() called before connect(), ignoring this call');
            return false;
        }

        this.ws.close();
        return true;
    },

    onConnect: function() {
        var client = this;

        if(this.debug >= 1)
            this.log('connected to server');

        this.inactive_interval = setInterval(this.destroyInactive.bind(this), this.inactive_check);

        var buf = new Buffer(5);
        buf.writeUInt8(254, 0);
        buf.writeUInt32LE(5, 1);

        if(this.ws.readyState !== WebSocket.OPEN) { //`ws` bug https://github.com/websockets/ws/issues/669 `Crash 2`
            this.onPacketError(new Packet(buf), new Error('ws bug #669:crash2 detected, `onopen` called with not established connection'));
            return;
        }

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
        if(this.auth_token) {
			var bytes = [102, 8, 1, 18, this.auth_token.length + 25, 1, 8, 10, 82, this.auth_token.length + 20, 1, 10, 13, 8, 5, 18, 5, 49, 46, 52, 46, 57, 24, 0, 32, 0, 16, 2, 26, this.auth_token.length, 1];
            for (var i = 0; i <= this.auth_token.length - 1; i++) {
				bytes.push(this.auth_token.charCodeAt(i));
			}
			buf = new Buffer(bytes.length);
            for (var i = 0; i <= bytes.length - 1; i++) {
				buf.writeUInt8(bytes[i], i);
            }
            this.send(buf);
        }

        client.emitEvent('connected');
    },

    onError: function(e) {
        if(this.debug >= 1)
            this.log('connection error: ' + e);

        this.emitEvent('connectionError', e);
        this.reset();
    },

    onDisconnect: function() {
        if(this.debug >= 1)
            this.log('disconnected');

        this.emitEvent('disconnect');
        this.reset();
    },

    onMessage: function(e) {
        var packet    = new Packet(e);
        if(!packet.length) {
            return this.onPacketError(packet, new Error('Empty packet received'));
        }
        var packet_id = packet.readUInt8();
        var processor = this.processors[packet_id];
        if(!processor) return this.log('[warning] unknown packet ID(' + packet_id + '): ' + packet.toString());

        if(this.debug >= 4)
            this.log('RECV packet ID=' + packet_id + ' LEN=' + packet.length);
        if(this.debug >= 5)
            this.log('dump: ' + packet.toString());

        this.emitEvent('message', packet);

        try {
            processor(this, packet);
        }catch(err){
            this.onPacketError(packet, err);
        }
    },

    // Had to do this because sometimes packets somehow get moving by 1 byte
    // https://github.com/pulviscriptor/agario-client/issues/46#issuecomment-169764771
    onPacketError: function(packet, err) {
        var crash = true;

        this.emitEvent('packetError', packet, err, function() {
            crash = false;
        });

        if(crash) {
            if(this.debug >= 1)
                this.log('Packet error detected! Check packetError event in README.md');
            throw err;
        }
    },

    send: function(buf) {
        if(this.debug >= 4)
            this.log('SEND packet ID=' + buf.readUInt8(0) + ' LEN=' + buf.length);

        if(this.debug >= 5)
            this.log('dump: ' + (new Packet(buf).toString()));

        try {
            this.ws.send(buf);
        }catch(e){
            this.onError(e);
        }
    },

    reset: function() {
        if(this.debug >= 3)
            this.log('reset()');

        clearInterval(this.inactive_interval);
        clearInterval(this.spawn_interval_id);
        this.spawn_interval_id = 0;
        this.leaders           = [];
        this.teams_scores      = [];
        this.my_balls          = [];
        this.spawn_attempt     = 0;

        for(var k in this.balls) if(this.balls.hasOwnProperty(k)) this.balls[k].destroy({'reason':'reset'});
        this.emitEvent('reset');
    },

    destroyInactive: function() {
        var time = (+new Date);

        if(this.debug >= 3)
            this.log('destroying inactive balls');

        for(var k in this.balls) {
            if(!this.balls.hasOwnProperty(k)) continue;
            var ball = this.balls[k];
            if(time - ball.last_update < this.inactive_destroy) continue;
            if(ball.visible) continue;

            if(this.debug >= 3)
                this.log('destroying inactive ' + ball);

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

                client.emitEvent('somebodyAteSomething', eater_id, eaten_id);
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
                var something_1 = !!(opt & 16); //TODO what is this?

                //reserved for future use?
                if (opt & 2) {
                    packet.offset += packet.readUInt32LE();
                }
                if (opt & 4) {
                    var something_2 = ''; //TODO something related to premium skins
                    while(1) {
                        var char = packet.readUInt8();
                        if(char == 0) break;
                        if(!something_2) something_2 = '';
                        something_2 += String.fromCharCode(char);
                    }
                }

                while(1) {
                    char = packet.readUInt16LE();
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

                if(client.debug >= 5)
                    client.log('action: ball_id=' + ball_id + ' coordinate_x=' + coordinate_x + ' coordinate_y=' + coordinate_y + ' size=' + size + ' is_virus=' + is_virus + ' nick=' + nick);

                client.emitEvent('ballAction', ball_id, coordinate_x, coordinate_y, size, is_virus, nick);
            }

            var balls_on_screen_count = packet.readUInt32LE();

            //disappear events
            for (i=0;i<balls_on_screen_count;i++) {
                ball_id = packet.readUInt32LE();

                ball = client.balls[ball_id] || new Ball(client, ball_id);
                if (ball.mine) {
                    ball.destroy({reason: 'merge'});
                    client.emitEvent('merge', ball.id);
                } else {
                    ball.disappear();
                    ball.update_tick = client.tick_counter;
                    ball.update();
                }
            }
        },

        //update spectating coordinates in "spectate" mode
        '17': function(client, packet) {
            var x    = packet.readFloat32LE();
            var y    = packet.readFloat32LE();
            var zoom = packet.readFloat32LE();

            if(client.debug >= 4)
                client.log('spectate FOV update: x=' + x + ' y=' + y + ' zoom=' + zoom);

            client.emitEvent('spectateFieldUpdate', x, y, zoom);
        },

        '18': function() {
            for(var k in this.balls) if(this.balls.hasOwnProperty(k)) this.balls[k].destroy({'reason':'server-forced'});
        },

        '20': function() {
            //i don't know what this is
            //in original code it clears our balls array, but i never saw this packet
        },

        //debug line drawn from the player to the specified point
        '21': function (client, packet) {
            var line_x = packet.readSInt16LE();
            var line_y = packet.readSInt16LE();

            if (client.debug >= 4)
                client.log('debug line drawn from x=' + line_x + ' y=' + line_y);
            client.emitEvent('debugLine', line_x, line_y);
        },

        //new ID of your ball (when you join or press space)
        '32': function(client, packet) {
            var ball_id = packet.readUInt32LE();
            var ball    = client.balls[ball_id] || new Ball(client, ball_id);
            ball.mine   = true;
            if(!client.my_balls.length) client.score = 0;
            client.my_balls.push(ball_id);

            if(client.debug >= 2)
                client.log('my new ball: ' + ball_id);

            if(client.spawn_interval_id) {
                if(client.debug >= 4)
                    client.log('detected new ball, disabling spawn() interval');
                client.spawn_attempt = 0;
                clearInterval(client.spawn_interval_id);
                client.spawn_interval_id = 0;
            }

            client.emitEvent('myNewBall', ball_id);
        },

        //leaderboard update in FFA mode
        '49': function(client, packet) {
            var highlights = [];
            var names = [];
            var count = packet.readUInt32LE();

            for(var i=0;i<count;i++) {
                var highlight = packet.readUInt32LE();

                var name = '';
                while(1) {
                    var char = packet.readUInt16LE();
                    if(char == 0) break;
                    name += String.fromCharCode(char);
                }

                highlights.push(highlight);
                names.push(name);
            }

            if(JSON.stringify(client.leaderHighlights) == JSON.stringify(highlights) &&
                JSON.stringify(client.leaderNames) == JSON.stringify(names)) {
                return;
            }
			
            var old_highlights  = client.leaderHighlights; 
            var old_leaderNames = client.leaderNames;
			client.leaderHighlights = highlights;
            client.leaderNames      = names;

            if(client.debug >= 3)
                client.log('leaders update: ' + JSON.stringify(highlights) + ',' + JSON.stringify(names));

            client.emitEvent('leaderBoardUpdate', old_highlights, highlights, old_leaderNames, names);
        },

        //teams scored update in teams mode
        '50': function(client, packet) {
            var teams_count  = packet.readUInt32LE();
            var teams_scores = [];

            for (var i=0;i<teams_count;++i) {
                teams_scores.push(packet.readFloat32LE());
            }

            if(JSON.stringify(client.teams_scores) == JSON.stringify(teams_scores)) return;
            var old_scores = client.teams_scores;

            if(client.debug >= 3)
                client.log('teams scores update: ' + JSON.stringify(teams_scores));

            client.teams_scores = teams_scores;

            client.emitEvent('teamsScoresUpdate', old_scores, teams_scores);
        },

        //map size load
        '64': function(client, packet) {
            var min_x = packet.readFloat64LE();
            var min_y = packet.readFloat64LE();
            var max_x = packet.readFloat64LE();
            var max_y = packet.readFloat64LE();

            if(client.debug >= 2)
                client.log('map size: ' + [min_x, min_y, max_x, max_y].join(','));

            client.emitEvent('mapSizeLoad', min_x, min_y, max_x, max_y);
        },

        //another unknown packet
        '72': function() {
            //packet is sent by server but not used in original code
        },

        '81': function(client, packet) {
            var level       = packet.readUInt32LE();
            var curernt_exp = packet.readUInt32LE();
            var need_exp    = packet.readUInt32LE();

            if(client.debug >= 2)
                client.log('experience update: ' + [level, curernt_exp, need_exp].join(','));

            client.emitEvent('experienceUpdate', level, curernt_exp, need_exp);
        },

        '102': function() {
            // This packet used for some shop server wss://web-live-v3-0.agario.miniclippt.com/ws
            // There is some "reserved" code for it in "account.js" that you can check. But it is not used since this server is useless for client
            // https://github.com/pulviscriptor/agario-client/issues/78
        },

        '103': function(client) {
            // Processor for that packet is missing in official client but @SzAmmi reports that he receives it
            // https://github.com/pulviscriptor/agario-client/issues/94
            client.emit('gotLogin');
        },

        //server forces client to logout
        '104': function(client, packet) {
            client.emitEvent('logoutRequest');
        },

        '240': function(client, packet) {
            packet.offset += 4;
            var packet_id = packet.readUInt8();
            var processor = client.processors[packet_id];
            if(!processor) return client.log('[warning] unknown packet ID(240->' + packet_id + '): ' + packet.toString());
            processor(client, packet);
        },

        //somebody won, end of the game (server restart)
        '254': function(client) {
            if(client.debug >= 1)
                client.log(client.balls[client.leaders[0]] + ' WON THE GAME! Server going for restart');

            client.emitEvent('winner', client.leaders[0]);
        }
    },

    updateScore: function() {
        var potential_score = 0;
        for (var i=0;i<this.my_balls.length;i++) {
            var ball_id = this.my_balls[i];
            var ball    = this.balls[ball_id];
            potential_score += Math.pow(ball.size, 2);
        }
        var old_score = this.score;
        var new_score = Math.max(this.score, Math.floor(potential_score / 100));

        if (this.score == new_score) return;
        this.score = new_score;
        this.emitEvent('scoreUpdate', old_score, new_score);

        if(this.debug >= 2)
            this.log('score: ' + new_score);

    },

    log: function(msg) {
        console.log(this.client_name + ': ' + msg);
    },

    // Fix https://github.com/pulviscriptor/agario-client/issues/95
    emitEvent: function() {
        var args = [];
        for(var i=0;i<arguments.length;i++) args.push(arguments[i]);
        try {
            this.emit.apply(this, args);
        } catch(e) {
            process.nextTick(function() {
                throw e;
            });
        }
    },

    //functions that you can call to control your balls

    //spawn ball
    spawn: function(name) {
        if(this.debug >= 3)
            this.log('spawn() called, name=' + name);

        if(!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            if(this.debug >= 1)
                this.log('[warning] spawn() was called when connection was not established, packet will be dropped');
            return false;
        }

        var buf = new Buffer(1 + 2*name.length);
        buf.writeUInt8(0, 0);
        for (var i=0;i<name.length;i++) {
            buf.writeUInt16LE(name.charCodeAt(i), 1 + i*2);
        }
        this.send(buf);

        //fix for unstable spawn on official servers
        if(!this.spawn_attempt && this.spawn_interval) {
            if(this.debug >= 4)
                this.log('Starting spawn() interval');

            var that = this;
            this.spawn_attempt = 1;
            this.spawn_interval_id = setInterval(function() {
                if(that.debug >= 4)
                    that.log('spawn() interval tick, attempt ' + that.spawn_attempt + '/' + that.spawn_attempts);

                if(that.spawn_attempt >= that.spawn_attempts) {
                    if(that.debug >= 1)
                        that.log('[warning] spawn() interval gave up! Disconnecting from server!');
                    that.spawn_attempt = 0;
                    clearInterval(that.spawn_interval_id);
                    that.spawn_interval_id = 0;
                    that.disconnect();
                    return;
                }
                that.spawn_attempt++;
                that.spawn(name);
            }, that.spawn_interval);
        }

        return true;
    },

    //activate spectate mode
    spectate: function() {
        if(!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            if(this.debug >= 1)
                this.log('[warning] spectate() was called when connection was not established, packet will be dropped');
            return false;
        }

        var buf = new Buffer([1]);
        this.send(buf);

        return true;
    },

    //switch spectate mode (toggle between free look view and leader view)
    spectateModeToggle: function() {
        if(!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            if(this.debug >= 1)
                this.log('[warning] spectateModeToggle() was called when connection was not established, packet will be dropped');
            return false;
        }

        var buf = new Buffer([18]);
		this.send(buf);
        var buf = new Buffer([19]);
		this.send(buf);

        return true;
    },

    moveTo: function(x, y) {
        if(!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            if(this.debug >= 1)
                this.log('[warning] moveTo() was called when connection was not established, packet will be dropped');
            return false;
        }
        var buf = new Buffer(13);
        buf.writeUInt8(16, 0);
        buf.writeInt32LE(Math.round(x), 1);
        buf.writeInt32LE(Math.round(y), 5);
        buf.writeUInt32LE(0, 9);
        this.send(buf);

        return true;
    },

    //split your balls
    //they will split in direction that you have set with moveTo()
    split: function() {
        if(!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            if(this.debug >= 1)
                this.log('[warning] split() was called when connection was not established, packet will be dropped');
            return false;
        }
        var buf = new Buffer([17]);
        this.send(buf);

        return true;
    },

    //eject some mass
    //mass will eject in direction that you have set with moveTo()
    eject: function() {
        if(!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            if(this.debug >= 1)
                this.log('[warning] eject() was called when connection was not established, packet will be dropped');
            return false;
        }
        var buf = new Buffer([21]);
        this.send(buf);

        return true;
    },

    //deprecated
    set facebook_key(_) {
        console.trace('Property "facebook_key" is deprecated. Please check in README.md how new authorization works');
    }
};

function Ball(client, id) {
    if(client.balls[id]) return client.balls[id];

    this.id    = id;
    this.name  = null;
    this.x     = 0;
    this.y     = 0;
    this.size  = 0;
    this.mass  = 0;
    this.virus = false;
    this.mine  = false;

    this.client      = client;
    this.destroyed   = false;
    this.visible     = false;
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
            this.client.emitEvent('mineBallDestroy', this.id, reason);
            if(!this.client.my_balls.length) this.client.emitEvent('lostMyBalls');
        }

        this.emitEvent('destroy', reason);
        this.client.emitEvent('ballDestroy', this.id, reason);
    },

    setCords: function(new_x, new_y) {
        if(this.x == new_x && this.y == new_y) return;
        var old_x = this.x;
        var old_y = this.y;
        this.x    = new_x;
        this.y    = new_y;

        if(!old_x && !old_y) return;
        this.emitEvent('move', old_x, old_y, new_x, new_y);
        this.client.emitEvent('ballMove', this.id, old_x, old_y, new_x, new_y);
    },

    setSize: function(new_size) {
        if(this.size == new_size) return;
        var old_size = this.size;
        this.size    = new_size;
        this.mass    = parseInt(Math.pow(new_size/10, 2));

        if(!old_size) return;
        this.emitEvent('resize', old_size, new_size);
        this.client.emitEvent('ballResize', this.id, old_size, new_size);
        if(this.mine) this.client.updateScore();
    },

    setName: function(name) {
        if(this.name == name) return;
        var old_name = this.name;
        this.name    = name;

        this.emitEvent('rename', old_name, name);
        this.client.emitEvent('ballRename', this.id, old_name, name);
    },

    update: function() {
        var old_time     = this.last_update;
        this.last_update = (+new Date);

        this.emitEvent('update', old_time, this.last_update);
        this.client.emitEvent('ballUpdate', this.id, old_time, this.last_update);
    },

    appear: function() {
        if(this.visible) return;
        this.visible = true;
        this.emitEvent('appear');
        this.client.emitEvent('ballAppear', this.id);

        if(this.mine) this.client.updateScore();
    },

    disappear: function() {
        if(!this.visible) return;
        this.visible = false;
        this.emitEvent('disappear');
        this.client.emitEvent('ballDisppear', this.id); //typo https://github.com/pulviscriptor/agario-client/pull/144
        this.client.emitEvent('ballDisappear', this.id);
    },

    toString: function() {
        if(this.name) return this.id + '(' + this.name + ')';
        return this.id.toString();
    },

    // Fix https://github.com/pulviscriptor/agario-client/issues/95
    emitEvent: function() {
        var args = [];
        for(var i=0;i<arguments.length;i++) args.push(arguments[i]);
        try {
            this.emit.apply(this, args);
        } catch(e) {
            process.nextTick(function() {
                throw e;
            });
        }
    }
};

// Inherit from EventEmitter
for (var key in EventEmitter.prototype) {
    if(!EventEmitter.prototype.hasOwnProperty(key)) continue;
    Client.prototype[key] = Ball.prototype[key] = EventEmitter.prototype[key];
}

Client.servers = servers;
Client.Packet  = Packet;
Client.Account = Account;
Client.Ball    = Ball;
module.exports = Client;
