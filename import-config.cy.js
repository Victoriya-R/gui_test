describe('API: Import Config', () => {
  const baseURL = Cypress.env('baseURL')
  const loginURL = `${baseURL}/axis/api/rest/businessGateway/login`
  const appUrl = `${baseURL}/html/command`

  const credentials = {
    user: 'GUI-TEST-ADMIN',
    password: '12345',
    manId: '1001',
    userGroupName: 'админ_1001|G',
  }

  // Склад на локальном стенде
  const warehouseName = 'Test_Import'

  const firstObjectVisibleId = '0035-1001' //VISIBLE_ID из файла импорта
  const firstObjectId = '0035-1001-1'
  const secondObjectVisibleId = '1135-1001' //VISIBLE_ID из файла импорта
  const secondObjectId = '1135-1001-2'

  const importKeysMaxAttempts = 10
  const pollIntervalMs = 10000


// Нужно извлечь 2 значения result:key
function parseImportResponse(xmlResponse) {
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(xmlResponse, 'text/xml')

  const parserError = xmlDoc.getElementsByTagName('parsererror')
  if (parserError.length > 0) {
    throw new Error(`Не удалось распарсить XML:\n${xmlResponse}`)
  }

  const messageNode = xmlDoc.getElementsByTagName('message')[0]
  const formNode = xmlDoc.getElementsByTagName('form')[0]

  const exitstatus =
    messageNode?.getAttribute('exitstatus') ||
    formNode?.getAttribute('exitstatus') ||
    null

  const exceptionMsg =
    messageNode?.getAttribute('exception_msgtxt') ||
    messageNode?.getAttribute('msgtxt') ||
    null

  const bindings = Array.from(xmlDoc.getElementsByTagName('binding'))

  const keyBinding =
    bindings.find((node) => node.getAttribute('name') === 'result:key') ||
    bindings.find((node) => node.getAttribute('name') === '_flat_:import_keys') ||
    null

  const items = keyBinding
    ? Array.from(keyBinding.getElementsByTagName('item'))
        .map((node) => node.getAttribute('value'))
        .filter(Boolean)
    : []

  const device_import1 = items.find((value) => /\|3\|1$/.test(value)) || null
  const device_import2 = items.find((value) => /\|3\|2$/.test(value)) || null

  return {
    exitstatus,
    exceptionMsg,
    device_import1,
    device_import2,
    items,
  }
}

function getImportKeys(sessionId, attempt = 1) {
  return cy.request({
    method: 'POST',
    url: `${baseURL}/axis/services/DispatcherWS`,
    headers: {
      'Content-Type': 'text/xml',
      'SOAPAction': '/axis/services/DispatcherWS',
      'Cookie': `sessionid=${sessionId}`,
    },
    body: `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                  xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/">
  <soapenv:Header/>
  <soapenv:Body>
    <ns2:getAddDetailData xmlns:ns2="https://fntsoftware.com/service"
                          soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
      <sessionid xsi:type="xsd:string">${sessionId}</sessionid>
      <activeService xsi:type="xsd:string">administration</activeService>
      <service xsi:type="xsd:string">administration</service>
      <module xsi:type="xsd:string">import</module>
      <view xsi:type="xsd:string">instancedata</view>
      <elid xsi:type="xsd:string"></elid>
      <type xsi:type="xsd:string">default</type>
    </ns2:getAddDetailData>
  </soapenv:Body>
</soapenv:Envelope>`,
    failOnStatusCode: false,
  }).then((response) => {
    const xmlResponse = response.body

    console.log(`getAddDetailData attempt ${attempt}:`, xmlResponse)

    expect(response.status).to.eq(200)

    const {
      exitstatus,
      exceptionMsg,
      device_import1,
      device_import2,
      items,
    } = parseImportResponse(xmlResponse)

    console.log('exitstatus:', exitstatus)
    console.log('exceptionMsg:', exceptionMsg)
    console.log('items:', items)
    console.log('device_import1:', device_import1)
    console.log('device_import2:', device_import2)

    if (exitstatus === '5') {
      throw new Error(
        `Сервис вернул ошибку сессии/сообщение: ${exceptionMsg || 'без текста'}\n${xmlResponse}`
      )
    }

    if (device_import1 && device_import2) {
      return { device_import1, device_import2 }
    }

    if (attempt >= importKeysMaxAttempts) {
      throw new Error(`Не удалось получить import keys. Ответ:\n${xmlResponse}`)
    }

    cy.wait(pollIntervalMs)
    return getImportKeys(sessionId, attempt + 1)
  })
}

function waitUploadFinished(sessionId, nextUrl = `${baseURL}/axis/servlet/C6ImportServlet?module=import&flash_update_method=&action=status`, attempt = 1) {
  return cy.request({
    method: 'GET',
    url: nextUrl,
    headers: {
      Cookie: `sessionid=${sessionId}`,
    },
    failOnStatusCode: false,
  }).then((response) => {
    expect(response.status).to.eq(200)

    const html = response.body
    console.log(`upload status attempt ${attempt}:`, html)

    if (html.includes('Файл успешно передан')) {
      return
    }

    if (html.includes('Файл передается на сервер')) {
      if (attempt >= 30) {
        throw new Error(`Загрузка файла не перешла в состояние "Файл успешно передан". Ответ:\n${html}`)
      }

      const refreshMatch = html.match(/URL="([^"]+)"/i)
      let resolvedNextUrl = nextUrl

      if (refreshMatch?.[1]) {
        const refreshPath = refreshMatch[1]

        if (refreshPath.startsWith('http')) {
          resolvedNextUrl = refreshPath
        } else {
          resolvedNextUrl = `${baseURL}/axis/servlet/${refreshPath}`
        }
      }

      cy.wait(2000)
      return waitUploadFinished(sessionId, resolvedNextUrl, attempt + 1)
    }

    throw new Error(`Неожиданный ответ action=status:\n${html}`)
  })
}

  it('login -> upload file -> get keys -> run import -> check warehouse objects', () => {
    return cy.request({
      method: 'POST',
      url: loginURL,
      headers: {
        'Content-Type': 'application/json',
      },
      body: credentials,
    }).then((loginResponse) => {
      expect(loginResponse.status).to.eq(200)
      expect(loginResponse.body).to.have.property('sessionId')

      const sessionId = loginResponse.body.sessionId
      expect(sessionId).to.exist

      let warehouseElid

      return cy.request({
        method: 'POST',
        url: `${baseURL}/axis/api/rest/entity/warehouse/query?sessionId=${sessionId}`,
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          restrictions: {
            name: {
              value: warehouseName,
              operator: '=',
            },
          },
          returnAttributes: [],
        },
      }).then((warehouseQueryResponse) => {
        expect(warehouseQueryResponse.status).to.eq(200)
        expect(warehouseQueryResponse.body).to.have.property('returnData')

        const warehouses = warehouseQueryResponse.body.returnData
        expect(warehouses, 'Проверка списка найденных складов').to.be.an('array')
        expect(
          warehouses.length,
          `Склад ${warehouseName} должен быть найден`
        ).to.be.greaterThan(0)

        warehouseElid = warehouses[0].elid
        expect(warehouseElid).to.exist

        cy.log(`warehouseElid: ${warehouseElid}`)

        // Стоит добавить проверку состояния склада до импорта
        return cy.request({
          method: 'POST',
          url: `${baseURL}/axis/api/rest/entity/warehouse/${warehouseElid}/ObjectsInWarehouse?sessionId=${sessionId}`,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            restrictions: {},
            returnAttributes: [],
          },
        }).then((warehouseBeforeResponse) => {
          expect(warehouseBeforeResponse.status).to.eq(200)
          expect(warehouseBeforeResponse.body).to.have.property('returnData')

          const beforeObjects = warehouseBeforeResponse.body.returnData
          expect(beforeObjects).to.be.an('array')

          const beforeHasFirstObject = beforeObjects.some(
            (item) =>
              item.deviceVisibleId === firstObjectVisibleId ||
              item.deviceId === firstObjectId
          )

          const beforeHasSecondObject = beforeObjects.some(
            (item) =>
              item.deviceVisibleId === secondObjectVisibleId ||
              item.deviceId === secondObjectId
          )

          // Проверка, что объектов не было до импорта
          expect(
            beforeHasFirstObject,
            '1 Оборудование не должно присутствовать на складе до импорта'
          ).to.eq(false)
          expect(
            beforeHasSecondObject,
            '2 Оборудование не должно присутствовать на складе до импорта'
          ).to.eq(false)

          cy.visit(appUrl, { failOnStatusCode: false })
          cy.setCookie('sessionid', sessionId, { path: '/' })
          cy.setCookie('sessionid', sessionId, { path: '/axis' })
         
          return cy.fixture('ExcelExportTest.xls', 'base64').then((fileContent) => {
            const blob = Cypress.Blob.base64StringToBlob(
              fileContent,
              'application/vnd.ms-excel'
            )

            return cy.window().then((win) => {
              const formData = new win.FormData()
              const file = new win.File([blob], 'ExcelExportTest.xls', {
                type: 'application/vnd.ms-excel',
              })

              formData.append('file', file)
              formData.append('importType', 'instancedata')
              formData.append('module', 'import')

              return win.fetch(`${baseURL}/axis/servlet/C6ImportServlet`, {
                method: 'POST',
                body: formData,
                credentials: 'include',
              })
            })

       }).then((uploadResponse) => {
         expect(uploadResponse.status).to.eq(200)

        return waitUploadFinished(sessionId).then(() => {
        return getImportKeys(sessionId)
        })
       })
          }).then(({ device_import1, device_import2 }) => {
            cy.log(`device_import1: ${device_import1}`)
            cy.log(`device_import2: ${device_import2}`)

            return cy.request({
              method: 'POST',
              url: `${baseURL}/axis/services/DispatcherWS`,
              headers: {
                'Content-Type': 'text/xml',
                'SOAPAction': '/axis/services/DispatcherWS',
                'Cookie': `sessionid=${sessionId}`,
              },
              body: `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                  xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/">
  <soapenv:Header/>
  <soapenv:Body>
    <ns2:runAction xmlns:ns2="https://fntsoftware.com/service"
                   soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
      <sessionid xsi:type="xsd:string">${sessionId}</sessionid>
      <service xsi:type="xsd:string">administration</service>
      <module xsi:type="xsd:string">import</module>
      <type xsi:type="xsd:string">default</type>
      <elid xsi:type="xsd:string"></elid>
      <action xsi:type="xsd:string">importInstanceData</action>
      <dataXml xsi:type="xsd:XML">
        <root>
          <data>
            <binding name="_flat_:import_keys" value="" restriction="" label="" type="">
              <item value="${device_import1}"/>
              <item value="${device_import2}"/>
            </binding>
            <binding name="_flat_:test_mode" value="false" restriction="" label="" type=""/>
            <binding name="_flat_:case_sensitive" value="false" restriction="" label="" type=""/>
          </data>
        </root>
      </dataXml>
    </ns2:runAction>
  </soapenv:Body>
</soapenv:Envelope>`,
            })
          }).then((importResponse) => {
            expect(importResponse.status).to.eq(200)

            cy.wait(pollIntervalMs)

            return cy.request({
              method: 'POST',
              url: `${baseURL}/axis/api/rest/entity/warehouse/${warehouseElid}/ObjectsInWarehouse?sessionId=${sessionId}`,
              headers: {
                'Content-Type': 'application/json',
              },
              body: {
                restrictions: {},
                returnAttributes: [],
              },
            })
          }).then((warehouseResponse) => {
            expect(warehouseResponse.status).to.eq(200)
            expect(warehouseResponse.body).to.have.property('returnData')

            const objects = warehouseResponse.body.returnData
            expect(objects).to.be.an('array')

            const hasFirstObject = objects.some(
              (item) =>
                item.deviceVisibleId === firstObjectVisibleId ||
                item.deviceId === firstObjectId
            )

            const hasSecondObject = objects.some(
              (item) =>
                item.deviceVisibleId === secondObjectVisibleId ||
                item.deviceId === secondObjectId
            )

            expect(
              hasFirstObject,
              'Проверка наличия первого объекта на складе'
            ).to.eq(true)
            expect(
              hasSecondObject,
              'Проверка наличия второго объекта на складе'
            ).to.eq(true)

            cy.log('Оба объекта найдены на складе после импорта')
          })
        })
      })
    })
  })
