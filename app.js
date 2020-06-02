const express = require('express');
const app = express();
const server = require('http').Server(app);

app.get('/', function(req, res) {
    res.sendFile(__dirname + '/client/index.html');
});
app.use('/client', express.static(__dirname + '/client'));

server.listen(2000);
console.log("Server started.");

const SOCKET_LIST = {};
const DEBUG = true;

const Entity = function(){
    const self = {
        x:250,
        y:250,
        spdX:0,
        spdY:0,
        id:"",
    }
    self.update = function(){
        self.updatePosition();
    }
    self.updatePosition = function(){
        self.x += self.spdX;
        self.y += self.spdY;
    }
    self.getDistance = function (pt){
        return Math.sqrt(Math.pow(self.x - pt.x, 2) + Math.pow(self.y - pt.y, 2));
    }
    return self;
}

const Player = function(id){
    const self = Entity();
    self.id = id;
    self.number = "" + Math.floor(10 * Math.random());
    self.pressingRight = false;
    self.pressingLeft = false;
    self.pressingUp = false;
    self.pressingDown = false;
    self.pressingAttack = false;
    self.mouseAngle = 0;
    self.maxSpd = 10;

    let super_update = self.update;
    self.update = function(){
        self.updateSpd();
        super_update();

        if(self.pressingAttack){
            self.shootBullet(self.mouseAngle);
        }
    }
    self.shootBullet = function(angle){
            const b = Bullet(self.id, angle);
            b.x = self.x;
            b.y = self.y;
    }

    self.updateSpd = function() {
        if(self.pressingRight)
            self.spdX = self.maxSpd;
        else if(self.pressingLeft)
            self.spdX = -self.maxSpd;
        else
            self.spdX= 0;
        if(self.pressingUp)
            self.spdY = -self.maxSpd;
        else if(self.pressingDown)
            self.spdY = self.maxSpd;
        else
            self.spdY = 0;
    }
    Player.list[id] = self;
    return self;
}

Player.list = {}
Player.onConnect = function(socket) {
    const player = Player(socket.id);
    socket.on('keyPress', function (data) {
        if (data.inputId === 'left')
            player.pressingLeft = data.state;
        else if (data.inputId === 'right')
            player.pressingRight = data.state;
        else if (data.inputId === 'up')
            player.pressingUp = data.state;
        else if (data.inputId === 'down')
            player.pressingDown = data.state;
        else if (data.inputId === 'attack')
            player.pressingAttack = data.state;
        else if (data.inputId === 'mouseAngle')
            player.mouseAngle = data.state;
    });
}
Player.onDisconnect = function (socket) {
    delete Player.list[socket.id];
}
Player.update = function () {
    const pack = [];
    for (let i in Player.list) {
        let player = Player.list[i];
        player.update();
        pack.push({
            x: player.x,
            y: player.y,
            number: player.number
        });
    }
    return pack;
}

const Bullet = function(parent, angle) {
    const self = Entity();
    self.id = Math.random();
    self.spdX = Math.cos(angle / 180 * Math.PI) * 10;
    self.spdY = Math.sin(angle / 180 * Math.PI) * 10;
    self.parent = parent
    self.timer = 0;
    self.toRemove = false;
    const super_update = self.update;
    self.update = function () {
        if (self.timer++ > 100)
            self.toRemove = true;
        super_update();

        for(let i in Player.list){
            const p = Player.list[i]
            if(self.getDistance(p) < 32 && self.parent !== p.id){
                // handle collision. ex: hp--;
                self.toRemove = true;
            }
        }
    }
    Bullet.list[self.id] = self;
    return self;
}

Bullet.list = {};

Bullet.update = function () {
    const pack = [];
    for (let i in Bullet.list) {
        let bullet = Bullet.list[i];
        bullet.update()
        if(bullet.toRemove)
            delete Bullet.list[i];
        pack.push({
            x: bullet.x,
            y: bullet.y,
        });
    }
    return pack;
}

const io = require('socket.io')(server, {});
io.sockets.on('connection', function (socket) {
    socket.id = Math.random();
    SOCKET_LIST[socket.id] = socket;
    Player.onConnect(socket);
    console.log('socket connection', socket.id);

    socket.on('disconnect', function () {
        delete SOCKET_LIST[socket.id];
        Player.onDisconnect(socket);
    });

    socket.on('sendMsgToServer', function (msg) {
        const playerName = ("" + socket.id).slice(2,7);
        for(let i in SOCKET_LIST){
            SOCKET_LIST[i].emit('addToChat', playerName + ': ' + msg);
        }
    });

    socket.on('evalServer', function(data) {
        if(!DEBUG)
            return;
        const res = eval(data);
        socket.emit('evalAnswer', res);
    });

});

setInterval(function (){
    const pack = {
        player: Player.update(),
        bullet: Bullet.update(),
    }
    for (let i in SOCKET_LIST) {
        let socket = SOCKET_LIST[i];
        socket.emit('newPosition', pack);
    }

}, 1000 / 25);