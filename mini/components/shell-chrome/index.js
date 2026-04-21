Component({
  properties: {
    chrome: {
      type: Object,
      value: {},
    },
    showBack: {
      type: Boolean,
      value: false,
    },
    backLabel: {
      type: String,
      value: '返回 Account',
    },
  },

  methods: {
    onBack() {
      this.triggerEvent('back')
    },
  },
})
