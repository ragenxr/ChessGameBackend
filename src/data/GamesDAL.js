const {DAL} = require('../base');
const {NotFoundError, InappropriateActionError} = require('../errors');

class GamesDAL extends DAL {
  fieldMap = {
    id: 'g.id',
    winner: 'g.winner',
    createdAt: 'g.created_at',
    finishedAt: 'g.finished_at',
    deletedAt: 'g.deleted_at',
    playerOneId: 'u1.id',
    playerOne: 'u1.login',
    playerTwoId: 'u2.id',
    playerTwo: 'u2.login',
    moves: this.db.raw('COALESCE(json_agg(m) FILTER (WHERE m.id IS NOT NULL), \'[]\')')
  };

  /**
   * Создает игру.
   * @param {int[]} userIds
   * @return {Promise<int>}
   */
   create = async(userIds) => {
    const [{id: gameId}] = await this.db
      .insert([{}])
      .into('games')
      .returning('id');

    await Promise.all([
      this.db
        .insert(
          userIds.map(
            (userId, idx) => ({
              user_id: userId,
              game_id: gameId,
              number: idx + 1
            })
          )
        )
        .into('players'),
      this.db
        .insert(
          userIds.map(
            (userId) => ({
              user_id: userId,
              entity: 'games',
              entity_id: gameId,
              level: 1 << 0 | 1 << 1
            })
          )
        )
        .into('accesses')
    ])

    return gameId;
  }

  /**
   * Добавляет ход.
   * @param {int} gameId
   * @param {int} number
   * @param {int} position
   * @returns {Promise<void>}
   */
  addMove = async(gameId, number, position) => {
    const game = await this.db
      .first({finishedAt: 'finished_at', deletedAt: 'deleted_at'})
      .from('games')
      .where({id: gameId});

    if (!game) {
      throw new NotFoundError('game', gameId);
    }

    await this.db
      .insert([{
        game_id: gameId,
        number,
        position
      }])
      .into('moves');
  }

  /**
   * Заканчивает игру.
   * @param {int} gameId
   * @param {?int} winner
   * @return {Promise<void>}
   */
   update = async(gameId, winner = null) => {
    const game = await this.db
      .first({finishedAt: 'finished_at', deletedAt: 'deleted_at'})
      .from('games')
      .where({id: gameId});

    if (!game) {
      throw new NotFoundError('game', gameId);
    }

    const {finishedAt, deletedAt} = game;

    if (deletedAt) {
      throw new InappropriateActionError('Can\'t finish deleted game');
    }

    if (finishedAt) {
      throw new InappropriateActionError('Can\'t finish finished game');
    }

    await this.db
      .update({
        finished_at: new Date().toISOString(),
        winner
      })
      .table('games')
      .where({id: gameId});
  }

  /**
   * Обновляет записи о играх.
   * @param {object[]} records
   * @return {Promise<void>}
   */
  updateMany = async(records) => {
    const fields = records.map(({id, winner}) => ({id, winner})).filter(({id}) => Boolean(id));
    const games = await this.db
      .select('*')
      .from('games')
      .where('id', 'in', fields.map(({id}) => id))
      .andWhere('finished_at', 'is', null)
      .andWhere('deleted_at', 'is', null);
    const existGames = games.map(({id}) => id);

    await this.db
      .insert(
        fields
          .filter(({id}) => existGames.includes(id))
          .map(
            ({id, winner}, idx) => ({
              id,
              winner,
              finished_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
            })
          )
      )
      .into('games')
      .onConflict('id')
      .merge(['winner', 'finished_at']);
  }

  /**
   * Отменяет игру.
   * @param {int} gameId
   * @return {Promise<void>}
   */
   delete = async(gameId) => {
    const game = await this.db
      .first({finishedAt: 'finished_at', deletedAt: 'deleted_at'})
      .from('games')
      .where({id: gameId});

    if (!game) {
      throw new NotFoundError('game', gameId);
    }

    const {finishedAt, deletedAt} = game;

    if (finishedAt) {
      throw new InappropriateActionError('Can\'t cancel finished game');
    }

    if (deletedAt) {
      throw new InappropriateActionError('Can\'t cancel canceled game');
    }

    await this.db
      .update({
        deleted_at: new Date().toISOString()
      })
      .table('games')
      .where({id: gameId});
  };

  /**
   * Получает игры.
   * @param {string[]} fields
   * @param {{operator: string, left: string, right: *}[]} filters
   * @param {?string} sort
   * @param {int} limit
   * @param {int} offset
   * @return {Promise<object[]>}
   */
   get = (fields, filters, sort= null, limit = 10, offset = 0) => {
     const withMoves = fields.includes('moves');
     const query = this.db
       .select(
         Object.fromEntries(
           fields.map(
             (field) => [
               field,
               withMoves && field !== 'moves' ?
                 this.db.raw(`MAX(${this.mapField(field)})`) :
                 this.mapField(field)
             ]
           )
         )
       )
       .from({g: 'games'})

     for (const {operator, left, right} of filters) {
       this.handleWhere(this.mapField(left), operator, right)(query);
     }

     if (fields.includes('playerOne') || fields.includes('playerOneId')) {
       query
         .leftJoin({p1: 'players'}, {'g.id': 'p1.game_id', 'p1.number': 1})
         .leftJoin({u1: 'users'}, {'p1.user_id': 'u1.id'})
     }
     if (fields.includes('playerTwo') || fields.includes('playerTwoId')) {
       query
         .leftJoin({p2: 'players'}, {'g.id': 'p2.game_id', 'p2.number': 2})
         .leftJoin({u2: 'users'}, {'p2.user_id': 'u2.id'})
     }
     if (withMoves) {
       query
         .leftJoin({m: 'moves'}, {'g.id': 'm.game_id'})
         .groupBy(['g.id']);
     }

     if (sort) {
       query.orderBy(this.mapField(sort), 'desc');
     }

     if (limit) {
       query.limit(limit);
     }

     if (offset) {
       query.offset(offset);
     }

     return query;
  }

  /**
   * Находит игру.
   * @param {int} gameId
   * @return {Promise<object>}
   */
   find = async(gameId) => {
     const [game] = await this.get(
       Object.keys(this.fieldMap),
       [
         {
           left: 'id',
           operator: '=',
           right: gameId
         }
       ]
     );

     if (!game) {
       throw new NotFoundError('game', gameId);
     }

     return game;
   }
}

module.exports = GamesDAL;
