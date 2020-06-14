const User = require('../models/User')
const jwt = require('jsonwebtoken')
const HttpStatus = require('http-status-codes')
const emailController = require('./email')
const HANDLER = require('../utils/response-helper')
const notificationHelper = require('../utils/notif-helper')
const notification = {
  heading: '',
  content: '',
  tag: ''
}

module.exports = {
  createUser: async (req, res, next) => {
    const user = new User(req.body)
    try {
      await user.save()
      const token = await user.generateAuthToken()
      // Added fn to send email to activate account with warm message
      await emailController.sendEmail(req, res, next, token)
      return res.status(HttpStatus.CREATED).json({ user: user, token: token })
    } catch (error) {
      console.log(error)
      return res.status(HttpStatus.NOT_ACCEPTABLE).json({ error: error })
    }
  },

  userProfile: async (req, res, next) => {
    res.status(HttpStatus.OK).json(req.user)
  },

  userProfileUpdate: async (req, res, next) => {
    const updates = Object.keys(req.body)
    const allowedUpdates = [
      'name',
      'email',
      'password',
      'company',
      'website',
      'location',
      'about'
    ]
    const isValidOperation = updates.every((update) => {
      return allowedUpdates.includes(update)
    })

    if (!isValidOperation) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'invalid update' })
    }

    try {
      updates.forEach((update) => {
        req.user[update] = req.body[update]
      })
      await req.user.save()
      res.status(HttpStatus.OK).json({ data: req.user })
    } catch (error) {
      res.status(HttpStatus.BAD_REQUEST).json({ error })
    }
  },

  forgotPasswordRequest: async (req, res) => {
    const { email } = req.body
    try {
      const user = await User.findOne({ email: email })
      if (!user) {
        res.status(HttpStatus.NOT_FOUND).json({ msg: 'User not found!' })
      }
      const token = jwt.sign({ _id: user._id, expiry: Date.now() + 10800000 }, process.env.JWT_SECRET)
      await user.save()
      return res.status(HttpStatus.OK).json({ success: true, token })
    } catch (error) {
      if (process.env.NODE_ENV !== 'production' && error) {
        console.log('Error in forgotPasswordRequest ', error)
      }
      res.status(HttpStatus.BAD_REQUEST).json({ error })
    }
  },

  updatePassword: async (req, res, next) => {
    const { password, id } = req.body
    const { token } = req.params
    try {
      const decodedToken = jwt.verify(token, process.env.JWT_SECRET)

      if (Date.now() <= decodedToken.expiry) {
        const user = await User.findById({
          _id: id
        })
        if (!user) {
          return res.status(HttpStatus.BAD_REQUEST).json({ msg: 'No such user' })
        }
        user.password = password
        await user.save()
        req.io.emit('Password update', { data: 'Password successfully updated!' })
        notification.heading = 'Forgot password!'
        notification.content = 'Password successfully updated!'
        notification.tag = 'Update'
        notificationHelper.addToNotificationForUser(req.user._id, res, notification, next)
        return res.status(HttpStatus.OK).json({ updated: true })
      } else {
        if (process.env.NODE_ENV !== 'production') {
          console.log('token expired')
        }
        res.status(HttpStatus.BAD_REQUEST).json({ error: 'Token expired' })
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production' && error) {
        console.log('Something went wrong ', error)
      }
      res.status(HttpStatus.BAD_REQUEST).json({ error })
    }
  },

  logout: (req, res, next) => {
    res.status(HttpStatus.OK).json({ success: 'ok' })
  },

  userDelete: async (req, res, next) => {
    try {
      await req.user.remove()
      res.send({ data: 'user deletion successful', user: req.user })
    } catch (error) {
      console.log(error)
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error })
    }
  },

  activateAccount: async (req, res, next) => {
    try {
      const { token } = req.params
      const decodedToken = jwt.verify(token, 'process.env.JWT_SECRET')
      const expiryTime = decodedToken.iat + 24 * 3600 * 1000 // 24 hrs
      if (expiryTime <= Date.now()) {
        const user = await User.findById(decodedToken._id)
        if (!user) {
          return res.status(HttpStatus.NOT_FOUND).json({ msg: 'User not found!' })
        }
        // if user found activate the account
        user.isActivated = true
        await user.save()
        req.io.emit('Account activate', { data: 'Account activated!' })
        notification.heading = 'Account activate!'
        notification.content = 'Account successfully activated!'
        notification.tag = 'Activate'
        notificationHelper.addToNotificationForUser(req.user._id, res, notification, next)
        return res.status(HttpStatus.OK).json({ msg: 'Succesfully activated!' })
      }
    } catch (Error) {
      return res.status(HttpStatus.BAD_REQUEST).json({ Error })
    }
  },

  getInviteLink: async (req, res, next) => {
    const token = jwt.sign({ _id: req.user._id, expiry: Date.now() + 24 * 3600 * 1000 }, process.env.JWT_SECRET)
    const inviteLink = `${req.protocol}://${req.get('host')}/user/invite/${token}`
    return res.status(HttpStatus.OK).json({ inviteLink: inviteLink })
  },

  processInvite: async (req, res, next) => {
    const { token } = req.params
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET)
    // check if token not expired and sender exist in db then valid request
    const user = await User.findById(decodedToken._id)
    if (user && Date.now() <= decodedToken.expiry) {
      console.log('Valid invite!')
      return res.status(HttpStatus.OK).json({ success: true, msg: 'Redirect user to register in client side!' })
    }
    return res.status(HttpStatus.BAD_REQUEST).json({ msg: 'Invalid token!' })
  },

  // ADD TO THE FOLLOWINGS LIST
  addFollowing: async (req, res, next) => {
    const { followId } = req.body
    try {
      if (followId === req.user._id) {
        return res.status(HttpStatus.OK).json({ msg: 'You can not follow yourself!' })
      }
      const user = await User.findById(req.user.id)
      if (!user) {
        return res.status(HttpStatus.BAD_REQUEST).json({ msg: 'No such user exists!' })
      }
      user.followings.unshift(followId)
      await user.save()
      next()
    } catch (error) {
      HANDLER.handleError(res, error)
    }
  },

  // ADD TO FOLLOWERS LIST
  addFollower: async (req, res, next) => {
    const { followId } = req.body
    try {
      const user = await User.findById(followId)
        .populate('followings', ['name.firstName', 'name.lastName', 'email'])
        .populate('followers', ['name.firstName', 'name.lastName', 'email'])
        .exec()
      if (!user) {
        return res.status(HttpStatus.BAD_REQUEST).json({ msg: 'No such user exists!' })
      }
      // add to the followers list
      user.followers.unshift(req.user.id)
      await user.save()
      const obj = {
        name: req.user.name.firstName,
        followId: user._id
      }
      req.io.emit('New follower', { data: `${obj}` })
      notification.heading = 'New follower!'
      notification.content = `${req.user.name.firstName} started following you!`
      notification.tag = 'Follower'
      notificationHelper.addToNotificationForUser(user._id, res, notification, next)
      return res.status(HttpStatus.OK).json({ user })
    } catch (error) {
      HANDLER.handleError(res, error)
    }
  },

  // REMOVE FROM FOLLOWINGS LIST
  removeFollowing: async (req, res, next) => {
    const { followId } = req.body
    try {
      const user = await User.findById(req.user._id)
      if (!user) {
        return res.status(HttpStatus.OK).json({ msg: 'No such user exists!' })
      }
      // check if followId is in following list or not
      const followingIdArray = user.followings.map(followingId => followingId._id)
      const isFollowingIdIndex = followingIdArray.indexOf(followId)
      if (isFollowingIdIndex === -1) {
        return res.status(HttpStatus.OK).json({ msg: 'You haven\'t followed the user!' })
      } else {
        // remove from followings list
        user.followings.splice(isFollowingIdIndex, 1)
        await user.save()
      }
      next()
    } catch (error) {
      HANDLER.handleError(res, error)
    }
  },

  // REMOVE FROM FOLLOWERS LIST
  removeFollower: async (req, res, next) => {
    const { followId } = req.body
    try {
      const user = await User.findById(followId)
        .populate('followings', ['name.firstName', 'name.lastName', 'email'])
        .populate('followers', ['name.firstName', 'name.lastName', 'email'])
        .exec()
      if (!user) {
        return res.status(HttpStatus.NOT_FOUND).json({ msg: 'No such user exists!' })
      }
      const followersIdArray = user.followers.map((follower) => follower._id)
      const isFollowingIndex = followersIdArray.indexOf(req.user._id)
      if (isFollowingIndex === -1) {
        return res.status(HttpStatus.OK).json({ msg: 'User is not following!' })
      }
      user.followers.splice(isFollowingIndex, 1)
      await user.save()
      return res.status(HttpStatus.OK).json({ user })
    } catch (error) {
      HANDLER.handleError(res, error)
    }
  },
  blockUser: async (req, res, next) => {
    const { id } = req.params
    try {
      const user = await User.findById(req.user._id)
        .populate('blocked', ['name.firstName', 'name.lastName', 'email'])
        .exec()
      if (!user) {
        return res.status(HttpStatus.BAD_REQUEST).json({ msg: 'Invalid request!' })
      }
      // check if admin
      if (user.isAdmin === true) {
        user.blocked.unshift(id)
        await user.save()
        return res.status(HttpStatus.OK).json({ user })
      }
      // else not permitted
      return res.status(HttpStatus.BAD_REQUEST).json({ msg: 'You don\'t have permission!' })
    } catch (error) {
      HANDLER.handleError(res, error)
    }
  },
  unBlockUser: async (req, res, next) => {
    const { id } = req.params
    try {
      const user = await User.findById(req.user._id)
        .populate('blocked', ['name.firstName', 'name.lastName', 'email'])
        .exec()
      if (!user) {
        return res.status(HttpStatus.NOT_FOUND).json({ msg: 'No such user exists!' })
      }
      // if admin
      if (user.isAdmin === true) {
        const blockedIds = user.blocked.map(item => item._id)
        const unblockIndex = blockedIds.indexOf(id)
        console.log('UnblockIndex ', unblockIndex)
        if (unblockIndex !== -1) {
          user.blocked.splice(unblockIndex, 1)
          await user.save()
          return res.status(HttpStatus.OK).json({ user })
        }
        return res.status(HttpStatus.NOT_FOUND).json({ user })
      }
      return res.status(HttpStatus.BAD_REQUEST).json({ msg: 'You don\'t have permission!' })
    } catch (error) {
      HANDLER.handleError(res, error)
    }
  }
}
