const fs = require('fs')
const path = require('path')
const fetch = require('node-fetch')
const config = require('../../config')


module.exports = function (app) {
  app.get('/maps/:name', async (req, res, next) => {
    try {
      let base = config.get('GIT_BASE_URL')
      base = base.endsWith('/') ? base.slice(0, -1) : base
      const owner = config.get('GIT_OWNER')
      const configUrl = `${base}/${owner}/maps/master/${req.params.name}/config.json`
      const configResponse = await fetch(configUrl)
      const readmeUrl = `${base}/${owner}/maps/master/${req.params.name}/README.html`
      const readmeResponse = await fetch(readmeUrl)
      const legendUrl= `${base}/${owner}/maps/master/${req.params.name}/legend.html`
      const legendResponse = await fetch(legendUrl)
      const filtersUrl = `${base}/${owner}/maps/master/${req.params.name}/filters.html`
      const filtersResponse = await fetch(filtersUrl)

      if (!configResponse.ok) {
        const message = await configResponse.text()
        res.status(configResponse.status)
        res.end(message)
        return
      }

      const configJson = await configResponse.json()
      const readme = await readmeResponse.text()
      const filters = await filtersResponse.text()
      const legend = await legendResponse.text()
      console.log(readme, legend)

      return res.render(path.join(__dirname, 'views/map-page.html'), {
        title: req.params.name,
        config: JSON.stringify(configJson),
        filters,
        readme,
        legend,
        auth: {
          username: process.env.CARTO_USERNAME,
          apiKey: process.env.CARTO_KEY
        }
      })
    } catch(e) {
      next(e)
    }
  })
}
