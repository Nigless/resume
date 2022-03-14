'use strict'
const equal = require("fast-deep-equal");
const safeEval = require('safe-eval-2');
const fs = require('fs');
const path = require('path');
const parser = require('posthtml-parser').default;
const {match} = require('posthtml/lib/api');

module.exports = (options) => {

	return function posthtmlInclude(tree) {
		let components = {};
		let links = tree.options.links || [];
		let scripts = tree.options.scripts || [];
		let from = tree.options.from || "";
		let props = tree.options.props || {};
		tree.messages = tree.messages || []
		tree.match = match;

		const replace = (str) => {
			let list = []
			str.replace(
				/<%((?:[^%]|%[^>])*)%>|((?:[^<]|<[^%])+)/g,
				(m, exp, text) => list.push(exp ? safeEval(exp, {props, children: tree.options.children || [], env: process.env}) : text));

			return list
		}

		tree.match({}, node => {
			node.attrs = node.attrs || {}
			Object.keys(node.attrs).forEach((key) => node.attrs[key] = replace(node.attrs[key]).join(''))

			return node
		})

		tree.match(/<%((?:[^%]|%[^>])*)%>/, node => {
			return replace(node)
		})

		tree.match({tag: 'link'}, node => {
			node.attrs = node.attrs || {}
			let href = node.attrs.href;
			if (href && /^\./.test(href))
				node.attrs.href = path.join(from, href)
			if (!links.some(link => equal(link, node)))
				links.push(node)

			return {tag: false}
		})

		tree.match({tag: 'script'}, node => {
			node.attrs = node.attrs || {}
			let src = node.attrs.src;
			if (src && /^\./.test(src))
				node.attrs.src = path.join(from, src)
			if (!scripts.some(script => equal(script, node)))
				scripts.push(node)

			return {tag: false}
		})

		tree.match({tag: 'img'}, node => {
			node.attrs = node.attrs || {}
			let src = node.attrs.src;
			if (src && /^\./.test(src))
				node.attrs.src = path.join(from, src)

			return node
		})

		tree.match({tag: 'component'}, node => {
			node.attrs = node.attrs || {}
			let src = node.attrs.src;
			if(!src || !node.attrs.name || !/^[A-Z]/.test(node.attrs.name)){
				return node
			}

			let file = path.join(from, src)
			components[node.attrs.name] = file
			tree.messages.push({
				type: 'dependency',
				file: path.join("./src", file)
			});

			return {tag: false}
		});

		Object.keys(components).map(key => tree.match({tag: key}, node => {
			let source = fs.readFileSync(path.resolve("./src", components[key]));
			tree.parser = parser;
			let subtree = tree.parser(source);
			subtree.options = { links, scripts, from: path.join(components[key], ".."), props: { ...node.attrs, children: node.content}}
			subtree.messages = tree.messages;

			return {
				tag: false,
				content: posthtmlInclude(subtree)
			}
		}))

		tree.match({tag: 'head'}, node => {
			return {...node, content:[...node.content, ...links]}
		})

		tree.match({tag: 'body'}, node => {
			return {...node, content:[...node.content, ...scripts]}
		})

		return tree;
	};
};
