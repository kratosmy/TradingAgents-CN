const { request } = require('./request')
const { loadRuntimeSettings, saveRuntimeSettings } = require('./runtime-settings')

const requestWechatCode = () => {
  return new Promise((resolve, reject) => {
    if (typeof wx === 'undefined' || !wx || typeof wx.login !== 'function') {
      reject(new Error('当前环境未提供 wx.login'))
      return
    }

    wx.login({
      success(result) {
        if (result && result.code) {
          resolve(result.code)
          return
        }

        reject(new Error('wx.login 未返回 code'))
      },
      fail(error) {
        reject(new Error(error && error.errMsg ? error.errMsg : 'wx.login 调用失败'))
      },
    })
  })
}

const buildProfilePayload = (profile = {}) => {
  return {
    nickname: profile.nickname || profile.nickName || '',
    avatar_url: profile.avatar_url || profile.avatarUrl || '',
  }
}

const loginWithWechatCode = (code, profile = {}, settings) => {
  return request({
    path: '/api/auth/wechat/login',
    method: 'POST',
    data: {
      code,
      ...buildProfilePayload(profile),
    },
    skipAuth: true,
    settings,
  })
}

const bindWechatCode = (code, profile = {}, settings) => {
  return request({
    path: '/api/auth/wechat/bind',
    method: 'POST',
    data: {
      code,
      ...buildProfilePayload(profile),
    },
    settings,
  })
}

const getWechatBindStatus = (settings) => {
  return request({
    path: '/api/auth/wechat/bind-status',
    settings,
  })
}

const unbindWechat = (settings) => {
  return request({
    path: '/api/auth/wechat/bind',
    method: 'DELETE',
    settings,
  })
}

const applyLoginResponse = (response, baseSettings) => {
  const data = response && response.data ? response.data : response
  const settings = baseSettings || loadRuntimeSettings()

  if (!data || !data.access_token) {
    throw new Error('登录响应缺少 access_token')
  }

  return saveRuntimeSettings({
    ...settings,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || '',
    user: data.user || null,
  })
}

module.exports = {
  applyLoginResponse,
  bindWechatCode,
  buildProfilePayload,
  getWechatBindStatus,
  loginWithWechatCode,
  requestWechatCode,
  unbindWechat,
}
