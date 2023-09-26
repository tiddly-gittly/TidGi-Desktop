# Workflow

## When app init

Frontend client fetching graph definition json and chat list from BaaS (Tiddlywiki or SoLiD POD). Chat list contains graph definition id as metadata.

Server load previous graph's state and id from local cache, and fetching graph definition json from BaaS, then just like start a new chat.

## When user start a new chat

Client send the graph definition id to the server, server fetching graph definition json from BaaS, then initialize the graph, and store the graph's state to local cache.
