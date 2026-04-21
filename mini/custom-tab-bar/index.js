const { PRIMARY_SURFACES, switchToPrimarySurface } = require('../lib/shell-navigation.js')

Component({
  data: {
    items: PRIMARY_SURFACES,
    selectedPath: '/pages/home/index',
  },

  methods: {
    setSelected(pagePath) {
      this.setData({
        selectedPath: pagePath,
      })
    },

    onSwitchTab(event) {
      const pagePath = event.currentTarget.dataset.pagePath

      if (!pagePath || pagePath === this.data.selectedPath) {
        return
      }

      switchToPrimarySurface(wx, pagePath)
    },
  },
})
