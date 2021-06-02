# electron-ipc-proxy

Use it locally before https://github.com/frankwallis/electron-ipc-proxy/pull/2 gets merged. Code in this PR has merged locally here.

============================

Transparent asynchronous remoting between renderer threads and the main thread using IPC.

[![build status](https://secure.travis-ci.org/frankwallis/electron-ipc-proxy.png?branch=master)](http://travis-ci.org/frankwallis/electron-ipc-proxy)

## Overview

Imagine you have a service which exists in your main (nodejs) thread and you want to access the service from one of your windows. By registering the service with electron-ipc-proxy, you will be able to create proxy objects in the browser window which behave as if they were calling the service directly. All communication happens asynchronously (unlike using electron remote) and so you won't freeze up your application.

## Example

You have a class which implements "TodoList" communications with the server, and has the following interface:

```js
interface TodoService {
  todos: Observable<Todo>;
  canAddTodos: Promise<boolean>;
  addTodo(user: string, description: string): Promise<void>;
  getTodosFor(user: string): Observable<Todo>;
}
```

You can make this service available to renderer threads by registering it with electron-ipc-proxy:

```js
import { registerProxy } from 'electron-ipc-proxy'

const todoService = createTodoService(...)
registerProxy(todoService, serviceDescriptor)
```

And then access it from renderer threads:

```js
import { createProxy } from 'electron-ipc-proxy'
import { Observable } from 'rxjs'

const todoService = createProxy(serviceDescriptor, Observable)

todoService.addTodo('frank', 'write the docs')
    .then(res => console.log('successfully added a todo'))
todoService.todos.subscribe(...)
```

What is this "serviceDescriptor" parameter? Service descriptors tell electron-ipc-proxy the shape of the object to be proxied and the name of a unique channel to communicate on, they're very simple:

```js
import { ProxyPropertyType } from 'electron-ipc-proxy';

const todoServiceDescriptor = {
  channel: 'todoService',
  properties: {
    todos: ProxyPropertyType.Value$,
    canAddTodos: ProxyPropertyType.Value,
    addTodo: ProxyPropertyType.Function,
    getTodosFor: ProxyPropertyType.Function$,
  },
};
```

## Notes

All `Values` and `Functions` will return promises on the renderer side, no matter how they have been defined on the source object. This is because communication happens asynchronously. For this reason it is recommended that you make them promises on the source object as well, so the interface is the same on both sides.

Use `Value$` and `Function$` when you want to expose or return an Observable stream across IPC.

Only plain objects can be passed between the 2 sides of the proxy, as the data is serialized to JSON, so no functions or prototypes will make it across to the other side.

Notice the second parameter of `createProxy` - `Observable` this is done so that the library itself does not need to take on a dependency to rxjs. You need to pass in the Observable constructor yourself if you want to consume Observable streams.

The channel specified must be unique and match on both sides of the proxy.

The packages exposes 2 entry points in the "main" and "browser" fields of package.json. "main" is for the main thread and "browser" is for the renderer thread.

## See it working

```sh
git clone https://github.com/frankwallis/electron-ipc-proxy.git
cd electron-ipc-proxy
npm install
npm run example
```
