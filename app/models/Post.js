const mongoose = require('mongoose')
const validator = require('validator')
const Schema = mongoose.Schema

const PostSchema = new Schema({
  content: {
    type: String,
    trim: true,
    required: true,
    validate (content) {
      if (validator.isEmpty(content)) {
        throw new Error('Post content can not be empty!')
      }
    }
  },
  image: {
    data: Buffer,
    contentType: String
  },
  votes: [
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      upVote: {
        type: Number,
        default: 0
      },
      downVote: {
        type: Number,
        default: 0
      }
    }
  ],
  comments: {
    type: Schema.Types.ObjectId,
    ref: 'Comment'
  },
  createdAt: {
    type: Date,
    default: Date.now()
  },
  updatedAt: {
    type: Date,
    default: Date.now()
  }
})

module.exports = mongoose.model('Post', PostSchema)
