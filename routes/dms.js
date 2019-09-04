'use strict'

const express = require('express')
const moment = require('moment')
const bytes = require('bytes')

const config = require('../config')
const dms = require('../lib/dms')
const utils = require('../utils')


module.exports = function () {
  const router = express.Router()
  const Model = new dms.DmsModel(config)

  // -----------------------------------------------
  // Redirects

  router.get('/organization/:owner', (req, res) => {
    const destination = '/' + req.params.owner
    res.redirect(301, destination)
  })

  router.get('/group', (req, res) => {
    res.redirect(301, '/collections')
  })

  router.get('/group/:collection', (req, res) => {
    const destination = '/collections/' + req.params.collection
    res.redirect(301, destination)
  })

  // End of redirects
  // -----------------------------------------------

  router.get('/', async (req, res) => {
    // If no CMS is enabled, show home page without posts
    res.render('home.html', {
      title: 'Home',
      posts: []
    })
  })

  router.get('/search', async (req, res, next) => {
    try {
      const result = await Model.search(req.query)
      // Pagination
      const from = req.query.from || 0
      const size = req.query.size || 10
      const total = result.count
      const totalPages = Math.ceil(total / size)
      const currentPage = parseInt(from, 10) / size + 1
      const pages = utils.pagination(currentPage, totalPages)

      res.render('search.html', {
        title: 'Search',
        result,
        query: req.query,
        totalPages,
        pages,
        currentPage
      })
    } catch (e) {
      next(e)
    }
  })

  router.get('/collections', async (req, res, next) => {
    try {
      const collections = await Model.getCollections()
      res.render('collections-home.html', {
        title: 'Dataset Collections',
        description: 'Catalogue of datasets for a particular project or team, or on a particular theme, or as a very simple way to help people find and search your own published datasets.',
        collections,
        slug: 'collections'
      })
    } catch (e) {
      next(e)
    }
  })

  router.get('/collections/:collectionName', async (req, res, next) => {
    try {
      // Get collection details
      const name = req.params.collectionName
      const collection = await Model.getCollection(name)
      // Get datasets for this collection
      if (req.query.q) {
        req.query.q += ` groups:${name}`
      } else {
        req.query.q = `groups:${name}`
      }
      const result = await Model.search(req.query)
      // Pagination
      const from = req.query.from || 0
      const size = req.query.size || 10
      const total = result.count
      const totalPages = Math.ceil(total / size)
      const currentPage = parseInt(from, 10) / size + 1
      const pages = utils.pagination(currentPage, totalPages)

      res.render('collection.html', {
        title: collection.title, // needed because this is used in base.html
        item: collection,
        result,
        query: req.query,
        totalPages,
        pages,
        currentPage
      })
    } catch (e) {
      next(e)
    }
  })

  function getResourceDataExplorer(view, resource) {
    let chartView, tabularMapView
    let controls = {
      showChartBuilder: false,
      showMapBuilder: false
    }
    
    if (config.get('CHART_BUILDER_FORMATS').includes(view.format)) controls = { showChartBuilder: true, showMapBuilder: true }

    if (config.get('TABULAR_FORMATS').includes(view.format)) {
      // DataExplorer specific view to render a chart from tabular data
      chartView = Object.assign({}, view)
      chartView.specType = 'simple'
      // DataExplorer specific view to render a map from tabular data
      tabularMapView = Object.assign({}, view)
      tabularMapView.specType = 'tabularmap'
    }
    
    const views =  (tabularMapView) ? [view, chartView, tabularMapView] : [view]
    const dataExplorer = JSON.stringify({resources: [resource], views, controls}).replace(/'/g, "&#x27;")
    return dataExplorer
  }
  
  function getResourceView(resource) {
    const view = {
      id: resource.index,
      title: resource.title || resource.name,
      format: resource.format,
      resources: [
         resource.name
      ],
      specType: null
    }

    // Add 'table' views for each tabular resource:
    if (config.get('TABULAR_FORMATS').includes(resource.format)) {
      // Default table view
      view.specType = 'table'
    } else if (resource.format.includes('json')) {
      // Add 'map' views for each geo resource:
      view.specType = 'map'
    } else if (resource.format === 'pdf') {
      view.specType = 'document'
    }

    return view
  }

  // Prepare resource for rendering
  function prepResource(resource) {
    // Convert bytes into human-readable format:
    resource.size = resource.size ? bytes(resource.size, {decimalPlaces: 0}) : resource.size
    resource.format = resource.format && resource.format.toLowerCase()

    return resource
  }

    /*
    */


  router.get('/:owner/:name', async (req, res, next) => {
    let datapackage = null

    try {
      datapackage = await Model.getPackage(req.params.name)
    } catch (err) {
      next(err)
      return
    }

    // Since "datapackage-views-js" library renders views according to
    // descriptor's "views" property, we need to generate view objects:
    datapackage.views = datapackage.views || []

    // Data Explorer used a slightly different spec
    datapackage.dataExplorers= []

    // Create a visualization per resource as needed
    datapackage.resources.forEach((resource, index) => {
      
      // Create share links
      const shareUrl = `${config.get('SITE_URL')}/${req.params.owner}/${req.params.name}/${resource.id}`
      resource.shareLink = shareUrl
      resource.iframeText = `<iframe src="${shareUrl}" width="100%" height="475px" frameborder="0"></iframe>`
      resource.index = index

      const preppedResource = prepResource(resource)
      const view = getResourceView(preppedResource)
      const dataExplorer = getResourceDataExplorer(view, preppedResource)

      
      datapackage.views.push(view)
      datapackage.dataExplorers.push(dataExplorer)
    })

    try {
      const profile = await Model.getProfile(req.params.owner)
      res.render('showcase.html', {
        title: req.params.owner + ' | ' + req.params.name,
        dataset: datapackage,
        owner: {
          name: profile.name,
          title: profile.title,
          description: utils.processMarkdown.render(profile.description),
          avatar: profile.image_display_url || profile.image_url
        },
        thisPageFullUrl: req.protocol + '://' + req.get('host') + req.originalUrl,
        dpId: JSON.stringify(datapackage).replace(/'/g, "&#x27;") // keep for backwards compat?
      })
    } catch (err) {
      next(err)
      return
    }
  })

  router.get('/:owner/:name/:resource_id', async (req, res, next) => {
    let datapackage,resource

    try {
      datapackage = await Model.getPackage(req.params.name)
      resource = datapackage.resources.filter(r => r.id === req.params.resource_id)[0]
    } catch (err) {
      next(err)
      return
    }

    const view = getResourceView(prepResource(resource))
    const dataExplorer = getResourceDataExplorer(view, resource)

    res.render("resource-bare.html", {dataExplorer})
  })

  router.get('/:owner/:name/datapackage.json', async (req, res, next) => {
    let datapackage = null

    try {
      datapackage = await Model.getPackage(req.params.name)
    } catch (err) {
      next(err)
      return
    }

    res.setHeader('Content-Type', 'application/json')
    res.status(200)
    res.end(JSON.stringify(datapackage))
  })

  router.get('/organization', async (req, res, next) => {
    try {
      const collections = await Model.getOrganizations()
      res.render('collections-home.html', {
        title: 'Organizations',
        description: 'CKAN Organizations are used to create, manage and publish collections of datasets. Users can have different roles within an Organization, depending on their level of authorisation to create, edit and publish.',
        collections,
        slug: 'organization'
      })
    } catch (err) {
      next(err)
    }
  })

  // MUST come last in order to catch all the publisher pages
  router.get('/:owner', async (req, res, next) => {
    try {
      // Get owner details
      const owner = req.params.owner
      const profile = await Model.getProfile(owner)
      const created = new Date(profile.created)
      const joinYear = created.getUTCFullYear()
      const joinMonth = created.toLocaleString('en-us', { month: "long" })
      // Get datasets for this owner
      if (req.query.q) {
        req.query.q += ` organization:${owner}`
      } else {
        req.query.q = `organization:${owner}`
      }
      const result = await Model.search(req.query)
      // Pagination
      const from = req.query.from || 0
      const size = req.query.size || 10
      const total = result.count
      const totalPages = Math.ceil(total / size)
      const currentPage = parseInt(from, 10) / size + 1
      const pages = utils.pagination(currentPage, totalPages)

      res.render('owner.html', {
        title: profile.title,
        owner: {
          name: profile.name,
          title: profile.title,
          description: utils.processMarkdown.render(profile.description),
          avatar: profile.image_display_url || profile.image_url,
          joinDate: joinMonth + ' ' + joinYear,
        },
        result,
        query: req.query,
        totalPages,
        pages,
        currentPage
      })
    } catch(err) {
      next(err)
    }
  })

  return router
}
