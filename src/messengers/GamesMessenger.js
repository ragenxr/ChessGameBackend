const {Messenger} = require('../base');
const {GamesDAL} = require('../data');
const PlayersMessenger = require('./PlayersMessenger');

class GamesMessenger extends Messenger {
  constructor({io, db}) {
    super({io});

    this.games = new GamesDAL({db});
    this.playersMessenger = new PlayersMessenger({io, db}); // TODO: убрать костыль
  }

  onInit = async() => {
    // Empty
  }

  onConnection = async(socket) => {
    socket.on(
      'games:connect',
      async(gameId) => {
        const game = await this.games.find(gameId);

        if (game.finishedAt) {
          socket.emit('games:already-finished');

          return;
        } else if (game.playerOne !== socket.data.login && game.playerTwo !== socket.data.login) {
          socket.emit('games:not-invited');

          return;
        }

        socket.join(`game#${gameId}`);
        socket.emit('games:connected', game);
      }
    );
    socket.on(
      'games:make-move',
      async(input) => {
        const {gameId} = input;
        const game = await this.games.find(gameId);

        if (game.finishedAt) {
          socket.emit('games:already-finished');

          return;
        } else if (game.playerOneId !== socket.data.id && game.playerTwoId !== socket.data.id) {
          socket.emit('games:not-invited');

          return;
        }

        try {
          this.io
            .in(`game#${gameId}`)
            .emit('games:move-made', input);
        } catch (err) {
          socket.emit('games:error', 'Internal Server Error');
        }
      }
    );
    socket.on(
      'games:finish-game',
      async({gameId, player}) => {
        await this.games.update(gameId, Number(!player) + 1);

        this.io
          .in(`game#${gameId}`)
          .emit('games:finished', {winner: player});
        this.io
          .in(`game#${gameId}`)
          .socketsLeave(`game#${gameId}`);
      }
    );
    socket.on(
      'games:message',
      async(gameId, message) => {
        const game = await this.games.find(gameId);

        if (game.finishedAt) {
          socket.emit('games:already-finished');

          return;
        } else if (game.playerOneId !== socket.data.id && game.playerTwoId !== socket.data.id) {
          socket.emit('games:not-invited');

          return;
        }

        this.io
          .in(`game#${gameId}`)
          .emit('games:message', {player: socket.data.login, message})
      }
    )
    socket.on(
      'disconnect',
      async() => {
        const players = await this.playersMessenger.getPlayersList();
        const player = players[socket.data.id];

        if (!player) {
          const activeGames = await Promise.all([
            this.games.get(
              ['id', 'playerOneId', 'playerTwoId'],
              [
                {
                  left: 'playerOneId',
                  operator: '=',
                  right: socket.data.id
                },
                {
                  left: 'finishedAt',
                  operator: 'is',
                  right: null
                },
                {
                  left: 'deletedAt',
                  operator: 'is',
                  right: null
                }
              ]
            ),
            this.games.get(
              ['id', 'playerOneId', 'playerTwoId'],
              [
                {
                  left: 'playerTwoId',
                  operator: '=',
                  right: socket.data.id
                },
                {
                  left: 'finishedAt',
                  operator: 'is',
                  right: null
                },
                {
                  left: 'deletedAt',
                  operator: 'is',
                  right: null
                }
              ]
            )
          ]);

          if (!activeGames.flat().length) {
            return;
          }

          await this.games.updateMany(
            activeGames.map(
              (activesGamesSet, offset) =>
                activesGamesSet.map(
                  ({id}) => ({
                    id,
                    winner: 2 - offset
                  })
                )
            ).flat()
          );

          for (const offset in activeGames) {
            activeGames[offset]
              .reduce((toRooms, {id}) => toRooms.in(`game#${id}`), this.io)
              .emit('games:finished', {winner: 2 - offset});
          }
        }
      }
    );
  }
}

module.exports = GamesMessenger;
