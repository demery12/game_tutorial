const express = require('express');
const app = express();
const server = require('http').Server(app);

app.get('/', function(req, res) {
    res.sendFile(__dirname + '/client/index.html');
});
app.use('/client', express.static(__dirname + '/client'));

server.listen(2000);
console.log("Server started.");

const io = require('socket.io')(server, {});
io.sockets.on('connection', function(socket){
    console.log('socket connection');
    socket.on('happy', function(data){
        console.log('happy because: ' + data.reason);
    });

    socket.emit('serverMsg', {
        msg:'hello',
    });
});