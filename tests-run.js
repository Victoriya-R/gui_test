// e2e-run-tests.js
const cypress = require('cypress')
const { merge } = require('mochawesome-merge')
const generator = require('mochawesome-report-generator')
const fse = require('fs-extra')

const webServerFolder = '/var/www/html/'
const spesc = [
    {module:"lcm",modulePath:"./cypress/e2e/modules/1-base-3-lcm"},
    {module:"nav",modulePath:"./cypress/e2e/modules/1-base-4-nav"},
]
async function copyReport() {
  try {
    await fse.copy("./mochawesome-report/assets", webServerFolder+"assets");
    await fse.copy("./mochawesome-report/mochawesome.html", webServerFolder+"mochawesome.html");
  } catch (err) {
    console.error(err);
  }
}
async function runTestsbyModule(module,modulePath) {
    await cypress.run({
        spec: modulePath,
        browser: 'chrome',
        reporter: 'mochawesome',
        reporterOptions: {
            reportDir: 'results/'+module,
            reportFilename: '[name].json',
            code: true,
            overwrite: false,
            html: false,
            json: true,
        }   
    })
}
async function runTestsWithReports() {
    const mergeOptions = {
        files: [
            './results/**/*.json',
        ],
    }    
    await fse.remove('mochawesome-report')
    await fse.remove('results')

    for (const spec of spesc) {
        await runTestsbyModule(spec.module,spec.modulePath)    
    }
    const jsonReport = await merge(mergeOptions)
    await generator.create(jsonReport)
    await copyReport()
    process.exit()
}

runTestsWithReports()
