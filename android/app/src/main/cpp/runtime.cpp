#include <jni.h>
#include <node.h>
#include <node_api.h>
#include <string>
#include <vector>
#include <cstdlib>
#include <unistd.h>
#include "node_arguments.h"
static JavaVM* vm=nullptr;
static jclass runtimeClass=nullptr;
static jmethodID commandMethod=nullptr;
static std::string str(JNIEnv* e,jstring value){const char* text=e->GetStringUTFChars(value,nullptr);std::string out(text);e->ReleaseStringUTFChars(value,text);return out;}
extern "C" JNIEXPORT jint JNI_OnLoad(JavaVM* value,void*){vm=value;return JNI_VERSION_1_6;}
static napi_value command(napi_env env,napi_callback_info info){
 size_t count=1; napi_value args[1];napi_get_cb_info(env,info,&count,args,nullptr,nullptr);size_t length=0;if(count!=1||napi_get_value_string_utf8(env,args[0],nullptr,0,&length)!=napi_ok){napi_throw_type_error(env,nullptr,"Solicitud nativa inválida");return nullptr;}std::vector<char> data(length+1);napi_get_value_string_utf8(env,args[0],data.data(),data.size(),&length);
 JNIEnv* e=nullptr;if(!vm||!runtimeClass||!commandMethod||(vm->GetEnv((void**)&e,JNI_VERSION_1_6)!=JNI_OK&&vm->AttachCurrentThread(&e,nullptr)!=JNI_OK)){napi_throw_error(env,nullptr,"Puente Android no disponible");return nullptr;}
 jbyteArray input=e->NewByteArray(length);e->SetByteArrayRegion(input,0,length,(const jbyte*)data.data());jbyteArray answer=(jbyteArray)e->CallStaticObjectMethod(runtimeClass,commandMethod,input);e->DeleteLocalRef(input);
 if(e->ExceptionCheck()){e->ExceptionClear();napi_throw_error(env,nullptr,"No se completó la operación nativa.");return nullptr;}
 if(!answer){napi_throw_error(env,nullptr,"Respuesta Android vacía");return nullptr;}jsize size=e->GetArrayLength(answer);std::vector<char> output(size);e->GetByteArrayRegion(answer,0,size,(jbyte*)output.data());e->DeleteLocalRef(answer);napi_value result;napi_create_string_utf8(env,output.data(),output.size(),&result);return result;
}
NAPI_MODULE_INIT(){napi_value fn;napi_create_function(env,"command",NAPI_AUTO_LENGTH,command,nullptr,&fn);napi_set_named_property(env,exports,"command",fn);return exports;}
extern "C" JNIEXPORT jint JNICALL Java_mx_elmuelle_pdv_NativeRuntime_start(JNIEnv* e,jclass,jstring script,jstring root,jstring library,jstring cache,jstring token,jint port){
 runtimeClass=(jclass)e->NewGlobalRef(e->FindClass("mx/elmuelle/pdv/NativeRuntime"));commandMethod=e->GetStaticMethodID(runtimeClass,"commandUtf8","([B)[B");
 std::string scriptPath=str(e,script),base=str(e,root),lib=str(e,library),tmp=str(e,cache),access=str(e,token),portText=std::to_string(port);
 setenv("TMPDIR",tmp.c_str(),1);setenv("HOME",base.c_str(),1);setenv("NODE_ENV","production",1);setenv("ANDROID_NATIVE_LIB",lib.c_str(),1);setenv("ANDROID_PRIVATE_ROOT",base.c_str(),1);setenv("ANDROID_HTTP_TOKEN",access.c_str(),1);setenv("HOST","127.0.0.1",1);setenv("PORT",portText.c_str(),1);setenv("NODE_OPTIONS","--max-old-space-size=384",1);unsetenv("NODE_TLS_REJECT_UNAUTHORIZED");chdir(base.c_str());
 NodeArguments args({"node",scriptPath});return node::Start(args.argc(),args.argv.data());
}
