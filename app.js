/* Set up the environment */
const ENV = "prod";
const DEBUG = false;

let config;
if (ENV === "local") {
    config = require(__dirname + '\\server\\config.js');
} else if (ENV === "prod") {
    config = {
        user:process.env.MONGO_USER,
        password:process.env.MONGO_PASSWORD,
        cluster:process.env.MONGO_CLUSTER,
    }
}

/* Prep connection details for mongoDB */
const MongoClient = require('mongodb').MongoClient;
const uri = "mongodb+srv://" + config.user + ":" + config.password + "@" + config.cluster + "/myGame?retryWrites=true&w=majority";
const client = new MongoClient(uri,  { useNewUrlParser: true, useUnifiedTopology: true});

/* prep express server */
const express = require('express');
const app = express();
const server = require('http').Server(app);

app.get('/', function(req, res) {
    res.sendFile(__dirname + '/client/index.html');
});
app.use('/client', express.static(__dirname + '/client'));

server.listen(process.env.PORT || 2000);
console.log("Server started.");
main().catch(console.error);

async function main(){
    try {
        await client.connect();
        console.log('DB connection established');
    } catch (e){
        console.error(e);
    }

    const SOCKET_LIST = {};

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
        self.hp = 10;
        self.hpMax = 10;
        self.score = 0;

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

        self.getInitPack = function() {
            return {
                id:self.id,
                x:self.x,
                y:self.y,
                number:self.number,
                hp:self.hp,
                hpMax:self.hpMax,
                score:self.score,
            };
        }

        self.getUpdatePack = function() {
            return {
                id:self.id,
                x:self.x,
                y:self.y,
                hp:self.hp,
                score:self.score,
            };
        }

        initPack.player.push(self.getInitPack());
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

        socket.emit('init', {
            selfId:socket.id,
            player:Player.getAllInitPack(),
            bullet:Bullet.getAllInitPack(),
        });
    }

    Player.getAllInitPack = function() {
        const players = [];
        for(let i in Player.list){
            players.push(Player.list[i].getInitPack());
        }
        return players
    }

    Player.onDisconnect = function (socket) {
        delete Player.list[socket.id];
        removePack.player.push(socket.id);
    }
    Player.update = function () {
        const pack = [];
        for (let i in Player.list) {
            let player = Player.list[i];
            player.update();
            pack.push(player.getUpdatePack());
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
                    // handle collision
                    p.hp -= 1;
                    if(p.hp <= 0){
                        const shooter = Player.list[self.parent];
                        if(shooter){
                            shooter.score += 1;
                        }
                        p.hp = p.hpMax;
                        p.x = Math.random() * 500;
                        p.y = Math.random() * 500;
                    }
                    self.toRemove = true;
                }
            }
        }
        Bullet.list[self.id] = self;
        self.getInitPack = function() {
            return {
                id:self.id,
                x:self.x,
                y:self.y,
            };
        }

        self.getUpdatePack = function() {
            return {
                id:self.id,
                x:self.x,
                y:self.y,
            };
        }

        initPack.bullet.push(self.getInitPack());
        return self;
    }

    Bullet.list = {};

    Bullet.getAllInitPack = function(){
        const bullets = [];
        for(let i in Bullet.list){
            bullets.push(Bullet.list[i].getInitPack());
        }
        return bullets;
    }
    Bullet.update = function () {
        const pack = [];
        for (let i in Bullet.list) {
            let bullet = Bullet.list[i];
            bullet.update()
            if (bullet.toRemove) {
                delete Bullet.list[i];
                removePack.bullet.push(bullet.id)
            }
            pack.push(bullet.getUpdatePack());
        }
        return pack;
    }

    async function isValidPassword(client, data) {
        try {
            const res = await client.db("myGame").collection("account").findOne({username:data.username, password:data.password});
            return res
        } catch(e) {
            console.error(e);
        }
    }

    async function isUsernameTaken(client, data){
        try {
            const res = await client.db("myGame").collection("account").findOne({username:data.username});
            return res
        } catch(e) {
            console.error(e);
        }
    }

    async function addUser(client, data){
        const res = await client.db("myGame").collection("account").insertOne({username:data.username, password:data.password});
        if(res){
            console.log(`Added new user: ${data.username} with id: ${res.insertedId}`);
        }
        return res;
    }

    const io = require('socket.io')(server, {});
    io.sockets.on('connection', function (socket) {
        socket.id = Math.random();
        SOCKET_LIST[socket.id] = socket;
        console.log('socket connection', socket.id);

        socket.on('signIn', function(data){
            isValidPassword(client, data).then((res) => {
                if (res) {
                    Player.onConnect(socket);
                    socket.emit('signInResponse', {success: true});
                } else {
                    socket.emit('signInResponse', {success: false});
                }
            }).catch(e => console.log(e));
        });

        socket.on('signUp', function(data){
            isUsernameTaken(client, data).then((res) => {
                if (res) {
                    Player.onConnect(socket);
                    socket.emit('signUpResponse', {success: false});
                } else {
                    addUser(client, data).then((signUpStatus) => {
                        if(signUpStatus)
                            socket.emit('signUpResponse', {success: true});
                        else
                            socket.emit('signUpResponse', {success: true});
                    });
                }
            }).catch(e => console.log(e));
        });

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

    const initPack = {player:[], bullet:[]};
    const removePack = {player:[], bullet:[]};

    setInterval(function (){
        const pack = {
            player: Player.update(),
            bullet: Bullet.update(),
        }
        for (let i in SOCKET_LIST) {
            let socket = SOCKET_LIST[i];
            socket.emit('init', initPack);
            socket.emit('update', pack);
            socket.emit('remove', removePack);
        }
        initPack.player = [];
        initPack.bullet = [];
        removePack.player = [];
        removePack.bullet = [];

    }, 1000 / 25);
}

