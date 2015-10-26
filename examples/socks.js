//This is example of connection to agar.io's server through SOCKS4/SOCKS5 server

if(process.argv.length < 5) {
    console.log('Please launch this script like');
    console.log(' node ./examples/socks.js SOCKS_VERSION SOCKS_IP SOCKS_PORT');
    console.log('SOCKS_IP - IP of SOCKS server');
    console.log('SOCKS_PORT - port of SOCKS server');
    console.log('SOCKS_VERSION - SOCKS server version. For 4 and 4a use "4", for 5 use "5"');
    console.log('*This script uses `socks` lib and this is params used by lib');
    process.exit(0);
}
console.log('Example will use SOCKS server ' + process.argv[3] + ':' + process.argv[4] + ' version ' + process.argv[2]);

//First we need to create agent for connection, you can do it any way with any lib you want.
//I will use `socks` lib https://www.npmjs.com/package/socks
var Socks = require('socks');

//For SOCKS4 we will need to resolve dmain name on client side
//If you use SOCKS4a or SOCKS5 you can skip this.
var dns = require('dns');

//And we need agario-client
var AgarioClient = require('../agario-client.js'); //Use next line in your code
//var AgarioClient = require('agario-client'); //Use this in your code

//Here is main code

requestServer(function(server, key) {
    //Here we already have server and key requested through SOCKS server
    //Now we will create agario-client
    var client = new AgarioClient('worker');
    client.debug = 2;

    //Create new agent for client
    client.agent = createAgent();

    client.once('leaderBoardUpdate', function(old, leaders) {
        var name_array = leaders.map(function(ball_id) {
            return client.balls[ball_id].name || 'unnamed'
        });

        client.log('Leaders on server: ' + name_array.join(', '));
        console.log('[SUCCESS!] Example succesfully connected to server through SOCKS server and received data. Example is over.');
        client.disconnect();
    });

    client.connect(server, key);
});

//Functions below

//We will need to create new agent for every new connection so we will make function
function createAgent() {
    return new Socks.Agent({
            proxy: {
                ipaddress: process.argv[3],
                port: parseInt(process.argv[4]),
                type: parseInt(process.argv[2])
            }}
    );
}

//You need to request server/key and connect to that server from same IP
//So you need to request server/key through same SOCKS server that you will be connecting from
function requestServer(cb) {
    //Create new agent
    var agent = createAgent();

    //If you use SOCKS version 4 then we need to resolve domain name on client side
    //If you use SOCKS version 4a or 5 you can pass domain name directly
    //If you pass domain name for 4 version then `socket` lib will thing this is 4a server and talk using wrong protocol
    //So we will resolve http://m.agar.io/ here
    dns.lookup('m.agar.io', function onLookup(err, address) {
        if(err || !address) {
            console.log('dns lookup failed: ' + err);
            process.exit(0);
        }
        console.log('Resolved http://m.agar.io/ to IP: ' + address + ', requesting server/key');

        //calling AgarioClient.servers.getFFAServer

        //Options for getFFAServer
        var get_server_opt = {
            region: 'EU-London', //server region
            agent:  agent,       //our agent
            ip: address          //IP of http://m.agar.io/ to connect. Only SOCKS version 4 needs IP.
                                 // 4a and 5 can accept domain names. But we already requested IP so we will use it.
        };

        AgarioClient.servers.getFFAServer(get_server_opt, function(srv) {
            if(!srv.server) {
                console.log('Failed to request server (error=' + srv.error + ', error_source=' + srv.error_source + ')');
                process.exit(0);
            }
            console.log('Got agar.io server ' + srv.server + ' with key ' + srv.key);

            //Calling callback that was passed to requestServer(cb)
            cb('ws://' + srv.server, srv.key);
        });
    });
}