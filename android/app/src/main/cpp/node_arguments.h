#pragma once
#include <string>
#include <vector>
#include <cstring>
// libuv requires writable, contiguous argv storage, including terminators.
struct NodeArguments {
 std::vector<char> storage;std::vector<char*> argv;
 explicit NodeArguments(const std::vector<std::string>& values){
  size_t bytes=0;for(const auto& value:values)bytes+=value.size()+1;
  storage.resize(bytes);argv.reserve(values.size()+1);size_t offset=0;
  for(const auto& value:values){argv.push_back(storage.data()+offset);std::memcpy(storage.data()+offset,value.c_str(),value.size()+1);offset+=value.size()+1;}
  argv.push_back(nullptr);
 }
 NodeArguments(const NodeArguments&)=delete;NodeArguments& operator=(const NodeArguments&)=delete;
 int argc()const{return static_cast<int>(argv.size()-1);}
};
