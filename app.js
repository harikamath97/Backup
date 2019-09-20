var Readconfig = require('./Readinputfile');
var downloadFormula = require('./Download');
var upload = require('./Upload');
const fs = require('fs');
const path = require('path');
var getFormula = require('./Getformulatemplate');
var setFormula = require('./Setformulatemplate');
const shelljs = require('shelljs');
const readlineSync = require('readline-sync');

async function main() {
  var values = await Readconfig('Input.json');
  console.log("start");
  let formulas = values.dev.formulas.formula_ids;
  /*
To delete all files under dev folder
*/
  const directory = 'dev';
  await fs.readdir(directory, (err, files) => {
    if (err) throw err;
    for (const file of files) {
      fs.unlink(path.join(directory, file), err => {
        if (err) throw err;
      });
    }
  });
  /*End */
  for (i in formulas) {
    let option = values.dev.options
    option.method = 'GET'
    option.path = "/elements/api-v2/formulas/" + formulas[i] + "/export";
    await downloadFormula(option, formulas).catch(err => {
      console.log("Request Failed");
    })
  }
  console.log("Download completed Successfully");
  switch (process.argv[2]) {
    case 'migration':
      migration();
      break;
    case 'update':
      update('update');
      break;
    case 'revert':
      update('revert');
    default:
      console.log('specify the correct operaion...!');
  }
}
async function migration() {
  var values = await Readconfig('Input.json');
  let option = values.prod.options;
  option.method = 'POST';
  option.path = '/elements/api-v2/formulas';
  let files = fs.readdirSync('dev');
  let mapper = {};
  for (i in files) {
    let map = await upload(option, files[i]).catch(err => {
      console.log("Failed to upload formula");
    });
    mapper = Object.assign(map, mapper);
  }
  values.mapper = mapper;
  fs.writeFile('Input.json', JSON.stringify(values), () => { });
  console.log("All formulas are successfully uploaded to production");
}


async function update(task) {

  let dir;
  let props;
  let flag = false;
  let updatetimestamp = new Date();

  var checkpoint = './prod/' + updatetimestamp;

  if (!fs.existsSync(checkpoint)) {
    fs.mkdirSync(checkpoint);
  }

  if (task === 'revert') {
    dir = 'prod'
  } else {
    dir = 'dev'
  }
  var values = await Readconfig('Input.json');
  let files = fs.readdirSync(dir);
  for (i in files) {
    let devfile = await Readconfig(dir + '/' + files[i]);
    option = values.prod.options;
    option.method = "GET"
    option.path = (dir === 'dev') ? "/elements/api-v2/formulas/" + values.mapper[devfile.id] : "/elements/api-v2/formulas/" + devfile.id;
    let existingformulatemplate = await getFormula(option).catch(err => {
      console.log("Get existing formula template request failed");
    })
    var jsonContent = JSON.stringify(existingformulatemplate);
    fs.writeFile(checkpoint + '/' + existingformulatemplate.name + '.json', jsonContent, (err) => {
      if (err) {
        throw err;
      }
    });
    let prodname = existingformulatemplate.name;
    let devname = devfile.name;
    let terminate = false;

    if (prodname !== devname) {
      var data = readlineSync.question('Seems like the formula in production has(' + prodname + ':' + devname + ') a different name in development! Do you wish to proceed (y/n):');
      if (data === 'n') {
        console.log('Migration terminated');
        terminate = true;
      }
    }
    for (i in existingformulatemplate.steps) {
      if (existingformulatemplate.steps[i].name === "Props" || existingformulatemplate.steps[i].name === "props") {
        props = existingformulatemplate.steps[i]
        flag = true
      }
    }


// --------------------------------------------------------------
    //code for finding steps added to the formula in production
// --------------------------------------------------------------
    
    let stepsupdate = [];
    let prolength = existingformulatemplate.steps.length;
    for (i in devfile.steps) {
      for (j = 0; j < prolength; j++) {
        if (devfile.steps[i].name !== existingformulatemplate.steps[j].name) {
          continue;
        }
        else {
          break;
        }
      }
      if (j === prolength) {
        stepsupdate.push(devfile.steps[i].name);
      }
    }

// --------------------------------------------------------------
    //code for finding steps deleted from the formula in production
// --------------------------------------------------------------

    let stepsdelete = [];
    let devlength = devfile.steps.length;
    for (i in existingformulatemplate.steps) {
      for (j = 0; j < devlength; j++) {
        if (existingformulatemplate.steps[i].name !== devfile.steps[j].name) {
          console.log("prod:",existingformulatemplate.steps[i].name);
          console.log("dev: ",devfile.steps[j].name);
          continue;
        }
        else {
          break;
        }
      }
      if (j === devlength) {
        stepsdelete.push(existingformulatemplate.steps[i].name);
      }
    }



    
    if (flag) {
      for (i in devfile.steps) {
        if (devfile.steps[i].name === "Props" || devfile.steps[i].name === "props") {
          devfile.steps[i] = props
        }
      }
    }
    existingformulatemplate.steps = devfile.steps;
    existingformulatemplate.triggers[0].onSuccess = devfile.triggers[0].onSuccess;
    existingformulatemplate.triggers[0].onFailure = devfile.triggers[0].onFailure;
    option.method = "PUT"
    if (terminate === false) {
      await setFormula(option, JSON.stringify(existingformulatemplate)).catch(err => {
        console.log("Set new formula request failed");
        // console.log(err);
      })
      console.log("New steps added :", stepsupdate);
      console.log("Old steps deleted :",stepsdelete);
    }
  }

  console.log("DONE");
}
main();  