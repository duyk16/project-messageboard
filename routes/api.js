/*
*
*
*       Complete the API routing below
*
*
*/

'use strict'

const expect = require('chai').expect
const mongoose = require('mongoose')
const ObjectId = mongoose.Types.ObjectId

const CONNECTION_URL = process.env.DB || 'mongodb://issue-user:issue123456@ds229108.mlab.com:29108/project-issuetracker'

mongoose.connect(CONNECTION_URL, { useNewUrlParser: true }, (err) => {
    if (err) return console.log('Connect MongoDB fail')
    console.log('Connect MongoDB success')
})

const boardSchema = new mongoose.Schema({}, { strict: false })

const Board = mongoose.model('Boards', boardSchema)

module.exports = function (app) {
    app.route('/api/threads/:board')
        .get(async (req, res) => {
            let { board } = req.params
            let boardData = await Board.findOne({ board }).lean().exec()
            if (!boardData) return res.json([])

            let { threads } = boardData
            threads = threads
                .sort((a, b) => a.bumped_on - b.bumped_on)
                .slice(0, 10)
                .map((thread) => {
                    let {
                        bumped_on, created_on, _id, replies, text,
                    } = thread
                    return {
                        bumped_on,
                        created_on,
                        _id,
                        replies: replies.reverse().slice(0, 3),
                        replycount: replies.length,
                        text,
                    }
                })
            return res.json(threads)
        })

        .post((req, res) => {
            let { board } = req.params
            let { delete_password, text } = req.body

            let _id = new ObjectId()
            let created_on = new Date()
            let bumped_on = new Date()
            let reported = false
            let replies = []
            let thread = {
                bumped_on, created_on, delete_password, _id, replies, reported, text
            }
            Board.findOneAndUpdate(
                { board },
                { $push: { threads: thread } },
                { upsert: true },
            ).then(() => res.redirect(`/b/${board}`))
        })

        .put((req, res) => {
            let { board } = req.params
            let { thread_id } = req.body

            Board.findOneAndUpdate(
                { board, 'threads._id': ObjectId(thread_id) },
                { $set: { 'threads.$.reported': true } },
            ).then((doc) => (doc.value) ? res.json('success') : res.json('thread id not found'))
        })

        .delete((req, res, next) => {
            let { board } = req.params
            let { delete_password, thread_id } = req.body
            Board.updateOne(
                { board },
                {
                    $pull: {
                        threads: {
                            _id: ObjectId(thread_id),
                            delete_password,
                        },
                    },
                },
            ).then((result) => { result.nModified ? res.send('success') : res.send('incorrect password') })
        })
    app.route('/api/replies/:board')
        .delete((req, res) => {
            let { board } = req.params
            let { delete_password, reply_id, thread_id } = req.body
            Board.updateOne(
                { board },
                { $set: { 'threads.$[thread].replies.$[reply].text': '[deleted]' } },
                {
                    arrayFilters: [
                        { 'thread._id': ObjectId(thread_id) },
                        {
                            'reply.delete_password': delete_password,
                            'reply._id': ObjectId(reply_id),
                        }
                    ]
                },
            ).lean().exec().then(result => result.nModified ? res.send('success') : res.send('incorrect password'))
        })

        .get((req, res, next) => {
            let { board } = req.params
            let { thread_id } = req.query
            Board.findOne({ board }).lean().exec()
                .then(board => {
                    let thread = board.threads.find(thread => String(thread._id) === thread_id)
                    let { bumped_on, created_on, _id, replies, text } = thread

                    return res.json({
                        _id,
                        bumped_on,
                        created_on,
                        replies,
                        replycount: replies.length,
                        text,
                    })
                })
        })

        .post((req, res, next) => {
            let { board } = req.params
            let { delete_password, thread_id, text } = req.body

            let reply_id = new ObjectId()
            let created_on = new Date()
            let bumped_on = new Date()
            let reported = false
            let reply = {
                created_on, delete_password, _id: reply_id, reported, text,
            }
            Board.findOneAndUpdate(
                { board, 'threads._id': ObjectId(thread_id) },
                { $push: { 'threads.$.replies': reply } },
            )
                .then(() => res.redirect(`/b/${board}/${thread_id}`))
        })

        .put((req, res, next) => {
            let { board } = req.params
            let { reply_id, thread_id } = req.body

            Board.updateOne(
                { board },
                { $set: { 'threads.$[thread].replies.$[reply].reported': true } },
                {
                    arrayFilters: [
                        { 'thread._id': ObjectId(thread_id) },
                        { 'reply._id': ObjectId(reply_id) },
                    ]
                },
            ).lean().exec().then(doc => {doc.nModified ? res.send('success') : res.send('reply id or thread id not found')})
        })
}
