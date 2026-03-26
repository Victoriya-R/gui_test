const { defineConfig } = require("cypress");

module.exports = defineConfig({
  projectId: 'oa2x8x',
  e2e: {
    setupNodeEvents(on, config) {
      // implement node event listeners here
      on('task', {
        logBaseUrl(baseUrl) {
          console.log('Printing baseUrl - from task', baseUrl)
          return null
        }
      })
    },
    viewportWidth: 1920,
    viewportHeight: 1060,
    screenshotOnRunFailure: true,
//    includeShadowDom: true,
    video: false,
    testIsolation: false,
//    reporter: 'mochawesome',
    // reporterOptions: {
    //   reportDir: 'results',
    //   reportFilename: '[name].json',
    //   overwrite: false,
    //   html: false,
    //   json: true,
    // },   
  },
  env: {
    baseTimeout: 120000,
    baseWait: 300,
//    baseURL: "https://basis-standard.rel.sdisoft.ru/app/command",
// baseURL: "https://basis-std14.tst.sdisoft.ru:9443",
  //baseURL: "http://localhost:8080/app/command",
    baseURL: "http://localhost:8080",
//    objManagementUrl: "https://10.101.0.101:9443/html/objmgmt/search/objects",
//username: "БАЗИС-ТЕСТ",
username: "GUI-TEST-ADMIN",
password: "12345",
//password: "command",
    license: "SDI Soft - IT Service",
    domain_0: "MyTestDomain",
    domain_1: "Домен по умолчанию",
    domain_3: "Домен_LOGIN",
    domain_4: "Обучение",
    group_0: "админ_1001",
    group_1: "изменение_1001",
    group_2: "работа_1001",
    group_3: "чтение_1001",
    group_4: "Grp_LOGIN",
    group_5: "БАЗИС"
  }
});
