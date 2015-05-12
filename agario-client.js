var WebSocket = require('ws');
var BufferDataview = require('buffer-dataview');
var EventEmitter = require('events').EventEmitter;

function Client(client_name) {
    //name used for log
    this.client_name = client_name;
    this.tick_counter = 0;

    if(this.debug >= 1)
        this.log('client created');
}

Client.prototype = {
    //you can change this values
    debug: 1, //debug level, 0-5 (5 will output extremely lot of data)
    inactive_destroy: 5*60*1000, //time in ms when to destroy inactive balls
    inactive_check: 10*1000, //time in ms when to search inactive balls

    //don't change things below if you don't understand what you're doing

    on: EventEmitter.prototype.addListener,
    once: EventEmitter.prototype.once,
    off: EventEmitter.prototype.removeListener,
    offAll: EventEmitter.prototype.removeAllListeners,
    emitEvent: EventEmitter.prototype.emit,
    removeListener: EventEmitter.prototype.removeListener,
    removeAllListeners: EventEmitter.prototype.removeAllListeners,

    inactive_interval: 0, //ID of setInterval()
    balls: {},  //all balls
    my_balls: [], //IDs of my vall
    leaders: [], //IDs of leaders

    connect: function(server) {
        var headers = {
            'Origin': 'http://agar.io'
        };

        this.ws = new WebSocket(server, null, {headers: headers});
        this.ws.binaryType = "arraybuffer";
        this.ws.onopen = this.onConnect.bind(this);
        this.ws.onmessage = this.onMessage.bind(this);
        this.ws.onclose = this.onDisconnect.bind(this);
        this.ws.onerror = this.onError.bind(this);

        if(this.debug >= 1)
            this.log('connecting...');

        this.emitEvent('connecting');
    },

    disconnect: function() {
        if(this.debug >= 1)
            this.log('disconnect() called');

        this.ws.close();
    },

    onConnect: function() {
        if(this.debug >= 1)
            this.log('connected');

        this.inactive_interval = setInterval(this.detsroyInactive.bind(this), this.inactive_check);

        var data = new Buffer([255, 0, 0, 0, 0]);
        this.send(data);

        this.emitEvent('connected');
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

    onMessage: function(buff) {
        var view = new BufferDataview(buff.data);
        var packet_id = view.getUint8(0);
        var processor = this.processors[packet_id];
        if(!processor) return this.log('warning: unknown packet ID(' + packet_id + '): ' + this.packetToString(view));

        if(this.debug >= 4)
            this.log('ACK packet ID=' + packet_id + ' LEN=' + view.byteLength);
        if(this.debug >= 5)
            this.log('dump: ' + this.packetToString(view));

        this.emitEvent('message', view);
        processor(this, view);
    },

    send: function(buff) {
        if(this.debug >= 4)
            this.log('SEND packet ID=' + buff[0] + ' LEN=' + buff.byteLength);

        if(this.debug >= 5)
            this.log('dump: ' + this.packetToString(buff));

        this.ws.send(buff);
    },

    reset: function() {
        if(this.debug >= 3)
            this.log('reset()');

        this.leaders = [];
        this.my_balls = [];
        clearInterval(this.inactive_interval);
        for(var k in this.balls) if(this.balls.hasOwnProperty(k)) this.balls[k].destroy({'reason':'reset'});
        this.emitEvent('reset');
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
        '16': function(client, view) {
            var pointer = 1;
            var eaters_count = view.getUint16(pointer, true);
            pointer += 2;

            client.tick_counter++;

            //reading eat events
            for(var i=0;i<eaters_count;i++) {
                var eater_id = view.getUint32(pointer, true);
                pointer += 4;
                var eaten_id = view.getUint32(pointer, true);
                pointer += 4;

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
                var color_salt;
                var nick = null;

                ball_id = view.getUint32(pointer, true);
                pointer += 4;
                if(ball_id == 0) break;
                coordinate_x = view.getFloat64(pointer, true);
                pointer += 8;
                coordinate_y = view.getFloat64(pointer, true);
                pointer += 8;
                size = view.getFloat64(pointer, true);
                pointer += 8;
                color_salt = view.getUint8(pointer);
                pointer += 1;

                if(color_salt == 0) {
                    is_virus = true;
                }else if(color_salt == 255) {
                    pointer += 3; //here we need to read RGB, but i dont want mess with colors
                    is_virus = !!(view.getUint8(pointer) & 1);
                    pointer += 1;
                }

                while(1) {
                    var char = view.getUint16(pointer, true);
                    pointer += 2;
                    if(char == 0) break;
                    if(!nick) nick = '';
                    nick += String.fromCharCode(char);
                }

                var ball = client.balls[ball_id] || new Ball(client, ball_id);
                ball.virus = is_virus;
                ball.setCords(coordinate_x, coordinate_y);
                ball.setSize(size);
                if(nick) ball.setName(nick);
                ball.update_tick = client.tick_counter;
                ball.appear();
                ball.update();

                if(client.debug >= 4)
                    client.log('action: ball_id=' + ball_id + ' coordinate_x=' + coordinate_x + ' coordinate_y=' + coordinate_y + ' size=' + size + ' is_virus=' + is_virus + ' nick=' + nick);

                client.emitEvent('ballAction', ball_id, coordinate_x, coordinate_y, size, is_virus, nick);
            }

            //looks like this 2 bytes allways 00 00 and not used
            //view.getUint16(pointer, true);
            pointer += 2;

            var balls_on_screen_count = view.getUint32(pointer, true);
            pointer += 4;

            //update events
            for(i=0;i<balls_on_screen_count;i++) {
                ball_id = view.getUint32(pointer, true);
                pointer += 4;

                ball = client.balls[ball_id] || new Ball(client, ball_id);
                ball.update_tick = client.tick_counter;
                ball.update();
            }

            for(ball_id in client.balls) {
                if(!client.balls.hasOwnProperty(ball_id)) continue;
                ball = client.balls[ball_id];
                if(!ball.visible) continue;
                if(ball.update_tick == client.tick_counter) continue;

                ball.update();
                if(ball.mine) {
                    ball.destroy({reason: 'merge'});
                    client.emitEvent('merge', ball.id);
                }else{
                    ball.disappear();
                }
            }
        },

        '20': function() {
            //i dont know what is this
            //in original code it clears our balls array, but i never saw this packet
        },

        //new ID of your ball (when you join or press space)
        '32': function(client, view) {
            var ball_id = view.getUint32(1, true);
            var ball = client.balls[ball_id] || new Ball(client, ball_id);
            ball.mine = true;
            client.my_balls.push(ball_id);

            if(client.debug >= 2)
                client.log('my new ball: ' + ball_id);

            client.emitEvent('myNewBall', ball_id);
        },

        //leaderboard update
        '49': function(client, view) {
            var pointer = 1;
            var users = [];

            var count = view.getUint32(pointer, true);
            pointer += 4;

            for(var i=0;i<count;i++) {
                var id = view.getUint32(pointer, true);
                pointer = pointer + 4;

                var name = '';
                while(1) {
                    var char = view.getUint16(pointer, true);
                    pointer += 2;
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

            client.emitEvent('leaderBoardUpdate', old_leaders, users);
        },

        //map size load
        '64': function(client, view) {
            var min_x = view.getFloat64(1, true);
            var min_y = view.getFloat64(9, true);
            var max_x = view.getFloat64(17, true);
            var max_y = view.getFloat64(25, true);

            if(client.debug >= 2)
                client.log('map size: ' + [min_x, min_y, max_x, max_y].join(','));

            client.emitEvent('mapSizeLoad', min_x, min_y, max_x, max_y);
        },

        //somebody won, end of the game (server restart)
        '254': function(client) {
            if(client.debug >= 1)
                client.log(client.balls[client.leaders[0]] + ' WON THE GAME! Server going for restart');

            client.emitEvent('winner', client.leaders[0]);
        }
    },

    packetToString: function(view) {
        var out = '';
        for(var i=0;i<view.byteLength;i++) {
            if(out) out += ' ';
            var char = view.getUint8(i).toString(16);
            if(char.length == 1) out += '0';
            out += char;
        }

        return out;
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

    Object.defineProperty(this, "is_virus", { get: function () {
        if(!client._is_mine_notified)
            console.trace('agario-client: Client.is_virus is deprecated, use "Client.virus" instead.\n' +
                'Please change your code, here is stack trace for you'); client._is_mine_notified = true; return this.virus; } });
    Object.defineProperty(this, "is_mine", { get: function () {
        if(!client._is_virus_notified)
            console.trace('agario-client: Client.is_mine is deprecated, use "Client.mine" instead.\n' +
                'Please change your code, here is stack trace for you'); client._is_virus_notified = true; return this.mine; } });

    this.client = client;
    this.destroyed = false;
    this.visible = false;
    this.last_update = (+new Date);
    this.update_tick = 0;

    client.balls[id] = this;
    return this;
}
Ball.prototype = {
    on: EventEmitter.prototype.addListener,
    once: EventEmitter.prototype.once,
    off: EventEmitter.prototype.removeListener,
    offAll: EventEmitter.prototype.removeAllListeners,
    emitEvent: EventEmitter.prototype.emit,

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
        this.x = new_x;
        this.y = new_y;

        if(!old_x && !old_y) return;
        this.emitEvent('move', old_x, old_y, new_x, new_y);
        this.client.emitEvent('ballMove', this.id, old_x, old_y, new_x, new_y);
    },

    setSize: function(new_size) {
        if(this.size == new_size) return;
        var old_size = this.size;
        this.size = new_size;

        if(!old_size) return;
        this.emitEvent('resize', old_size, new_size);
        this.client.emitEvent('ballResize', this.id, old_size, new_size);
    },

    setName: function(name) {
        if(this.name == name) return;
        var old_name = this.name;
        this.name = name;

        this.emitEvent('rename', old_name, name);
        this.client.emitEvent('ballRename', this.id, old_name, name);
    },

    update: function() {
        var old_time = this.last_update;
        this.last_update = (+new Date);

        this.emitEvent('update', old_time, this.last_update);
        this.client.emitEvent('ballUpdate', this.id, old_time, this.last_update);
    },

    appear: function() {
        if(this.visible) return;
        this.visible = true;
        this.emitEvent('appear');
        this.client.emitEvent('ballAppear', this.id);
    },

    disappear: function() {
        if(!this.visible) return;
        this.visible = false;
        this.emitEvent('disappear');
        this.client.emitEvent('ballDisppear', this.id);
    },

    toString: function() {
        if(this.name) return this.id + '(' + this.name + '}';
        return this.id.toString();
    }
};

module.exports = Client;
