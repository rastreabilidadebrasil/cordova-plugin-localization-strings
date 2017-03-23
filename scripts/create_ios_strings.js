
module.exports = function(context) {

    var path = context.requireCordovaModule('path');
    var q = context.requireCordovaModule('q');
    var deferred = q.defer();
    var glob = context.requireCordovaModule('glob');
    var xcode = context.requireCordovaModule("xcode");

    var localizableStringsPaths = [];
    var infoPlistPaths = [];

    var fs = context.requireCordovaModule('fs');
    var _ = context.requireCordovaModule('lodash');
    //var iconv = context.requireCordovaModule('iconv-lite');

    var iosProjFolder;
    var iosPbxProjPath;

    var getValue = function(config, name) {
        var value = config.match(new RegExp('<' + name + '>(.*?)</' + name + '>', "i"))
        if(value && value[1]) {
            return value[1]
        } else {
            return null
        }
    }

    function jsonToDotStrings(jsonObj){
        var returnString = "";
        _.forEach(jsonObj, function(val, key){
            returnString += '"'+key+'" = "' + val +'";\n';
        });
        return returnString;
    }

    function initIosDir(){
        if (!iosProjFolder || !iosPbxProjPath) {
            var config = fs.readFileSync("config.xml").toString();
            var name = getValue(config, "name");

            iosProjFolder =  "platforms/ios/" + name;
            iosPbxProjPath = "platforms/ios/" + name + ".xcodeproj/project.pbxproj";
        }
    }

    function getTargetIosDir() {
        initIosDir();
        return iosProjFolder;
    }

    function getXcodePbxProjPath() {
        return iosPbxProjPath;
    }

    function writeStringFile(plistStringJsonObj, lang, fileName) {
        var lProjPath = getTargetIosDir() + "/Resources/" + lang + ".lproj";
        if(!fs.existsSync(lProjPath)){
            fs.mkdirSync(lProjPath);
        }

        var stringToWrite = jsonToDotStrings(plistStringJsonObj);
        //  var buffer = iconv.encode(stringToWrite, 'utf16');

        fs.open(lProjPath + "/" + fileName, 'w', function(err, fd) {
            if(err) throw err;
            fs.writeFileSync(fd, stringToWrite);
        });

    }

    function writeLocalisationFieldsToXcodeProj(filePaths, groupname, proj) {
        var fileRefSection = proj.pbxFileReferenceSection();
        var fileRefValues = _.values(fileRefSection);

        if (filePaths.length > 0) {

            // var groupKey;
            var groupKey = proj.findPBXVariantGroupKey({name: groupname});
            if (!groupKey) {
                // findPBXVariantGroupKey with name InfoPlist.strings not found.  creating new group
                var localizableStringVarGroup = proj.addLocalizationVariantGroup(groupname);
                groupKey = localizableStringVarGroup.fileRef;
            }

            filePaths.forEach(function (path) {
                var results = _.filter(fileRefValues, {path: '"' + path + '"'});
                if (_.isArray(results) && results.length == 0) {
                    //not found in pbxFileReference yet
                    proj.addResourceFile("Resources/" + path, {variantGroup: true}, groupKey);
                }
            });
        }
    }

    getTargetLang(context)
        .then(function(languages) {
            console.log('tes');
            try {
                languages.forEach(function (lang) {

                    //read the json file
                    var langJson = require(lang.path);
                    if (_.has(langJson, "APP_NAME")) {
                        //do processing for appname into plist
                        var plistString = {
                            CFBundleDisplayName: langJson.APP_NAME,
                            CFBundleName: langJson.APP_NAME
                        };
                        writeStringFile(plistString, lang.lang, "InfoPlist.strings");
                        infoPlistPaths.push(lang.lang + ".lproj/" + "InfoPlist.strings");
                    }

                    //remove APP_NAME and write to Localizable.strings
                    var localizableStringsJson = _.omit(langJson, "APP_NAME");
                    if (!_.isEmpty(localizableStringsJson)) {
                        writeStringFile(localizableStringsJson, lang.lang, "Localizable.strings");
                        localizableStringsPaths.push(lang.lang + ".lproj/" + "Localizable.strings");
                    }
                });

                var proj = xcode.project(getXcodePbxProjPath());

                proj.parse(function (err) {
                    if (err) {
                        deferred.reject(err);
                    }
                    else {

                        writeLocalisationFieldsToXcodeProj(localizableStringsPaths, 'Localizable.strings', proj);
                        writeLocalisationFieldsToXcodeProj(infoPlistPaths, 'InfoPlist.strings', proj);

                        fs.writeFileSync(getXcodePbxProjPath(), proj.writeSync());
                        console.log('new pbx project written with localization groups');
                        deferred.resolve();
                    }
                });
            }catch (err){
                console.log(err.stack);
            }
        })

    return deferred.promise;
};

function getTargetLang(context) {
    var targetLangArr = [];
    var deferred = context.requireCordovaModule('q').defer();
    var path = context.requireCordovaModule('path');
    var glob = context.requireCordovaModule('glob');
    console.log('teste');

    glob("translations/app/*.json",
        function(err, langFiles) {
            console.log('teste1');
            if(err) {
                deferred.reject(err);
            }
            else {

                try{
                    langFiles.forEach(function(langFile) {
                        var matches = langFile.match(/translations\/app\/(.*).json/);
                        console.log(matches);
                        if (matches) {
                            targetLangArr.push({
                                lang: matches[1],
                                path: path.join(context.opts.projectRoot, langFile)
                            });
                        }
                    });
                    deferred.resolve(targetLangArr);
                } catch (err){
                    console.log(JSON.stringify(err.stack));
                }
            }
        }
    );
    return deferred.promise;
}

