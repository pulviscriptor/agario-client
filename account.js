var https = require('https');
var agar_client_id = '677505792353827'; //hardcoded in client

function Account() {
    this.token    = null;
    this.provider = 1;
    this.c_user   = null;
    this.datr     = null;
    this.xs       = null;
    this.agent    = null;
    this.debug    = 1;

    this.ws         = null;
    this.connecting = false;
    this.connected  = false;
}

Account.prototype.log = function(text) {
    console.log('AgarioClient.Account: ' + text);
};

//request token from facebook
Account.prototype.requestFBToken = function(cb) {
    var account = this;

    if(this.debug >= 1) {
        if(!this.c_user) this.log('[warning] You did not specified Agent.c_user');
        if(!this.datr)   this.log('[warning] You did not specified Agent.datr');
        if(!this.xs)     this.log('[warning] You did not specified Agent.xs');
    }

    var ret = {
        error: null,
        res: null,
        data: null
    };

    var cookies = 'c_user=' + encodeURIComponent(this.c_user) + ';' +
        'datr=' + encodeURIComponent(this.datr) + ';' +
        'xs=' + encodeURIComponent(this.xs) + ';';

    var options = {
        host: 'www.facebook.com',
        path: '/dialog/oauth?client_id=' + agar_client_id + '&redirect_uri=https://agar.io&scope=public_profile,%20email&response_type=token',
        method: 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0',
            'Cookie': cookies
        },
        agent: this.agent || null
    };

    var req = https.request(options, function(res) {
        var data = '';
        ret.res = res;

        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            data += chunk;
        });
        res.on('end', function() {
            ret.data = data;
        });

        if(res && res.headers && res.headers.location) {
            res.headers.location.replace(/access_token=([a-zA-Z0-9-_]*)&/, function(_, parsed_token) {
                if(parsed_token) {
                    account.token = parsed_token;
                    account.provider = 1;
                }
            })
        }

        if(cb) cb(account.token, ret);
    });

    req.on('error', function(e) {
        ret.error = e;
        if(cb) cb(null, ret);
    });

    req.end();
};

module.exports = Account;
